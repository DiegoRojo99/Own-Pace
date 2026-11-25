import "server-only";
import { db } from "./db";
import { parseBoundary } from "./city-lookup-data";
import { cityTileBatch } from "./city-tiles";
import { TILE_ZOOM } from "./tiles";
import { precomputedCity, savedCatalogMatches } from "./city-catalog";

export async function getCityProgress(userId: string) {
  // One snapshot keeps readiness and totals consistent; both claims and selections belong to this user.
  const rows = await db.$queryRaw<{
    id: string; name: string; label: string; ready: boolean; total: number; explored: number;
    osmType: "WAY" | "RELATION"; osmId: bigint; boundary: unknown; fingerprint: string | null;
  }[]>`
    SELECT c."id", c."name", uc."label", c."osmType", c."osmId", c."boundary",
      c."runnableTiles"->>'fingerprint' AS "fingerprint",
      COALESCE(c."tilesReady" AND c."tileZoom" = ${TILE_ZOOM} AND c."runnableTiles" IS NOT NULL, false) AS "ready",
      COUNT(ct."cityId")::int AS "total", COUNT(ut."id")::int AS "explored"
    FROM "UserCity" uc
    JOIN "City" c ON c."id" = uc."cityId"
    LEFT JOIN "CityTile" ct ON ct."cityId" = c."id" AND ct."zoom" = ${TILE_ZOOM}
    LEFT JOIN "UserTile" ut ON ut."userId" = ${userId} AND ut."zoom" = ct."zoom" AND ut."x" = ct."x" AND ut."y" = ct."y"
    WHERE uc."userId" = ${userId}
    GROUP BY c."id", c."name", c."tilesReady", c."tileZoom", uc."label", uc."addedAt"
    ORDER BY uc."addedAt" DESC, c."id" ASC
  `;
  return rows.map(({ osmType, osmId, boundary, fingerprint, ready, ...row }) => {
    const catalog = precomputedCity(osmType, osmId, boundary);
    return { ...row, available: !!catalog, ready: ready && !!catalog && fingerprint === catalog.fingerprint };
  });
}

export class CityCatalogUnavailableError extends Error {
  constructor() { super("This city needs a new precomputed tile catalog."); }
}

export async function prepareCityTiles(userId: string, cityId: string) {
  // Check ownership before locking a shared city, and again within the transaction.
  const tracked = await db.userCity.findUnique({ where: { userId_cityId: { userId, cityId } }, select: { city: true } });
  if (!tracked) return null;
  const snapshot = precomputedCity(tracked.city.osmType, tracked.city.osmId, tracked.city.boundary);
  if (!snapshot) throw new CityCatalogUnavailableError();
  if (tracked.city.tilesReady && tracked.city.tileZoom === TILE_ZOOM &&
      savedCatalogMatches(tracked.city.runnableTiles, snapshot.fingerprint)) return { done: true };
  const initialBoundary = parseBoundary(tracked.city.boundary);
  if (!initialBoundary) throw new Error("Stored city boundary is invalid");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "City" WHERE "id" = ${cityId} FOR UPDATE`;
    const selection = await tx.userCity.findUnique({ where: { userId_cityId: { userId, cityId } }, select: { cityId: true } });
    if (!selection) return null;
    const city = await tx.city.findUniqueOrThrow({ where: { id: cityId } });
    const currentCatalog = precomputedCity(city.osmType, city.osmId, city.boundary);
    if (!currentCatalog) throw new CityCatalogUnavailableError();
    const savedRunnable = savedCatalogMatches(city.runnableTiles, currentCatalog.fingerprint);
    if (city.tilesReady && city.tileZoom === TILE_ZOOM && savedRunnable) return { done: true };
    // Network work happens outside the lock; a boundary edit makes that snapshot obsolete.
    if (city.boundaryFetchedAt.getTime() !== tracked.city.boundaryFetchedAt.getTime()) return { done: false };
    const boundary = parseBoundary(city.boundary);
    if (!boundary) throw new Error("Stored city boundary is invalid");
    const runnable = new Set(currentCatalog.keys);
    const rebuilding = city.tileZoom !== TILE_ZOOM || !savedRunnable;
    if (rebuilding) await tx.cityTile.deleteMany({ where: { cityId } });
    if (!rebuilding && (city.tileNextX === null || city.tileNextY === null)) throw new Error("City tile cursor is invalid");
    const cursor = rebuilding ? null : { x: city.tileNextX!, y: city.tileNextY! };
    const batch = cityTileBatch(boundary, TILE_ZOOM, cursor);
    for (let offset = 0; offset < batch.tiles.length; offset += 500) {
      const tiles = batch.tiles.slice(offset, offset + 500).filter(({ x, y }) => runnable.has(`${x}/${y}`));
      if (!tiles.length) continue;
      await tx.tile.createMany({ data: tiles, skipDuplicates: true });
      await tx.cityTile.createMany({ data: tiles.map((tile) => ({ cityId, ...tile })), skipDuplicates: true });
    }
    await tx.city.update({
      where: { id: cityId },
      data: {
        ...(!savedRunnable ? { runnableTiles: currentCatalog } : {}),
        tileZoom: TILE_ZOOM, tilesReady: batch.next === null, tileNextX: batch.next?.x ?? null, tileNextY: batch.next?.y ?? null,
      },
    });
    return { done: batch.next === null };
  }, { timeout: 20_000 });
}
