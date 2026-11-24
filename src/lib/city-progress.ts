import "server-only";
import { db } from "./db";
import { parseBoundary } from "./city-lookup-data";
import { cityTileBatch } from "./city-tiles";
import { TILE_ZOOM } from "./tiles";

export async function getCityProgress(userId: string) {
  // One snapshot keeps readiness and totals consistent; both claims and selections belong to this user.
  return db.$queryRaw<{ id: string; name: string; label: string; ready: boolean; total: number; explored: number }[]>`
    SELECT c."id", c."name", uc."label",
      COALESCE(c."tilesReady" AND c."tileZoom" = ${TILE_ZOOM}, false) AS "ready",
      COUNT(ct."cityId")::int AS "total", COUNT(ut."id")::int AS "explored"
    FROM "UserCity" uc
    JOIN "City" c ON c."id" = uc."cityId"
    LEFT JOIN "CityTile" ct ON ct."cityId" = c."id" AND ct."zoom" = ${TILE_ZOOM}
    LEFT JOIN "UserTile" ut ON ut."userId" = ${userId} AND ut."zoom" = ct."zoom" AND ut."x" = ct."x" AND ut."y" = ct."y"
    WHERE uc."userId" = ${userId}
    GROUP BY c."id", c."name", c."tilesReady", c."tileZoom", uc."label", uc."addedAt"
    ORDER BY uc."addedAt" DESC, c."id" ASC
  `;
}

export async function prepareCityTiles(userId: string, cityId: string) {
  // Check ownership before locking a shared city, and again within the transaction.
  const tracked = await db.userCity.findUnique({ where: { userId_cityId: { userId, cityId } }, select: { cityId: true } });
  if (!tracked) return null;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "City" WHERE "id" = ${cityId} FOR UPDATE`;
    const selection = await tx.userCity.findUnique({ where: { userId_cityId: { userId, cityId } }, select: { cityId: true } });
    if (!selection) return null;
    const city = await tx.city.findUniqueOrThrow({ where: { id: cityId } });
    if (city.tilesReady && city.tileZoom === TILE_ZOOM) return { done: true };
    const boundary = parseBoundary(city.boundary);
    if (!boundary) throw new Error("Stored city boundary is invalid");
    const rebuilding = city.tileZoom !== TILE_ZOOM;
    if (rebuilding) await tx.cityTile.deleteMany({ where: { cityId } });
    if (!rebuilding && (city.tileNextX === null || city.tileNextY === null)) throw new Error("City tile cursor is invalid");
    const cursor = rebuilding ? null : { x: city.tileNextX!, y: city.tileNextY! };
    const batch = cityTileBatch(boundary, TILE_ZOOM, cursor);
    for (let offset = 0; offset < batch.tiles.length; offset += 500) {
      const tiles = batch.tiles.slice(offset, offset + 500);
      await tx.tile.createMany({ data: tiles, skipDuplicates: true });
      await tx.cityTile.createMany({ data: tiles.map((tile) => ({ cityId, ...tile })), skipDuplicates: true });
    }
    await tx.city.update({
      where: { id: cityId },
      data: { tileZoom: TILE_ZOOM, tilesReady: batch.next === null, tileNextX: batch.next?.x ?? null, tileNextY: batch.next?.y ?? null },
    });
    return { done: batch.next === null };
  }, { timeout: 20_000 });
}
