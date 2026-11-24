import "server-only";
import { randomUUID } from "node:crypto";
import { decode } from "@googlemaps/polyline-codec";
import { Prisma } from "@/generated/prisma/client";
import { EXPLORER_ACTIVITY_TYPES } from "./activity-types";
import { db } from "./db";
import { decodePolyline } from "./polyline";
import { TILE_ZOOM, tilesForRoute } from "./tiles";

const pendingWhere = (userId: string) => ({
  userId, type: { in: EXPLORER_ACTIVITY_TYPES }, tilesProcessed: false, summaryPolyline: { not: null },
});

/** Process one owned activity atomically. Concurrent processing and recalculation serialize on the user row. */
export async function processActivityTiles(activity: { id: string; userId: string }): Promise<string[]> {
  // Every read and write is scoped to the signed-in user.
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${activity.userId} FOR UPDATE`;
    const current = await tx.activity.findFirst({
      where: { ...pendingWhere(activity.userId), id: activity.id },
      select: { id: true, startDate: true, summaryPolyline: true },
    });
    if (!current) return [];
    if (!current.summaryPolyline) {
      await tx.activity.updateMany({ where: { id: current.id, userId: activity.userId }, data: { tilesProcessed: true } });
      return [];
    }
    let points: [number, number][];
    try {
      // Validate before using the codec, which assumes a well-formed input.
      decodePolyline(current.summaryPolyline);
      points = decode(current.summaryPolyline, 5);
    } catch (error) {
      console.error("Skipping invalid explorer route:", error instanceof Error ? error.message : "Invalid polyline");
      await tx.activity.updateMany({ where: { id: current.id, userId: activity.userId }, data: { tilesProcessed: true } });
      return [];
    }
    const keys = [...tilesForRoute(points, TILE_ZOOM)];
    const inserted: { x: number; y: number; inserted: boolean }[] = [];
    // Keep SQL parameters and statement sizes bounded for long routes.
    for (let offset = 0; offset < keys.length; offset += 500) {
      const values = keys.slice(offset, offset + 500).map((key) => {
        const [x, y] = key.split("/").map(Number);
        return Prisma.sql`(${randomUUID()}, ${activity.userId}, ${x}, ${y}, ${TILE_ZOOM}, ${current.id}, ${current.startDate}, 1)`;
      });
      const rows = await tx.$queryRaw<{ x: number; y: number; inserted: boolean }[]>(Prisma.sql`
        INSERT INTO "UserTile" ("id", "userId", "x", "y", "zoom", "firstActivityId", "firstVisitedAt", "visitCount")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("userId", "zoom", "x", "y") DO UPDATE SET
          "visitCount" = "UserTile"."visitCount" + 1,
          "firstActivityId" = CASE WHEN EXCLUDED."firstVisitedAt" < "UserTile"."firstVisitedAt" THEN EXCLUDED."firstActivityId" ELSE "UserTile"."firstActivityId" END,
          "firstVisitedAt" = LEAST("UserTile"."firstVisitedAt", EXCLUDED."firstVisitedAt")
        RETURNING "x", "y", (xmax = 0) AS "inserted"
      `);
      inserted.push(...rows);
    }
    await tx.activity.updateMany({ where: { id: current.id, userId: activity.userId }, data: { tilesProcessed: true } });
    return inserted.filter((row) => row.inserted).map((row) => `${row.x}/${row.y}`);
  }, { timeout: 20_000 });
}

/** Process a bounded oldest-first batch; remaining work can be resumed on the next request. */
export async function processPendingActivities(userId: string, limit: number) {
  // Both the pending list and progress count are restricted to this user.
  const pending = await db.activity.findMany({
    where: pendingWhere(userId),
    select: { id: true, userId: true },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(50, Math.floor(limit))),
  });
  let processed = 0;
  const started = Date.now();
  for (const activity of pending) {
    if (processed > 0 && Date.now() - started > 6_000) break;
    await processActivityTiles(activity);
    processed++;
  }
  const remaining = await db.activity.count({ where: pendingWhere(userId) });
  return { processed, remaining };
}

/** Clear only this user's tiles and make their activities eligible for rebuilding. */
export async function resetExplorer(userId: string) {
  // The lock, deletion and reset all target the signed-in user.
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await tx.userTile.deleteMany({ where: { userId } });
    await tx.activity.updateMany({ where: { userId }, data: { tilesProcessed: false } });
  });
}
