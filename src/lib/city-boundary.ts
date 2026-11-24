import "server-only";
import { parseBoundary, type CityBoundary } from "./city-lookup-data";
import { db } from "./db";

/** Accept a GeoJSON geometry or a Feature wrapping one. */
export function parseBoundaryInput(value: unknown): CityBoundary | null {
  const geometry = value && typeof value === "object" && (value as { type?: unknown }).type === "Feature"
    ? (value as { geometry?: unknown }).geometry : value;
  return parseBoundary(geometry);
}

/** Replace a city's boundary and discard its tiles so they are rebuilt from the new shape. */
export async function updateCityBoundary(cityId: string, boundary: CityBoundary) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "City" WHERE "id" = ${cityId} FOR UPDATE`;
    const city = await tx.city.findUnique({ where: { id: cityId }, select: { id: true } });
    if (!city) return false;
    await tx.cityTile.deleteMany({ where: { cityId } });
    await tx.city.update({
      where: { id: cityId },
      data: { boundary, boundaryFetchedAt: new Date(), tileZoom: null, tileNextX: null, tileNextY: null, tilesReady: false },
    });
    return true;
  }, { timeout: 20_000 });
}
