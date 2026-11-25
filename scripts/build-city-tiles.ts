import "dotenv/config";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { buildRunnableKeys } from "../src/lib/city-build-fetch";
import { makeCatalogCity, type CatalogCity } from "../src/lib/city-catalog-data";
import { parseBoundary } from "../src/lib/city-lookup-data";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to read tracked city boundaries");
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  let rows: { name: string; osmType: "WAY" | "RELATION"; osmId: string; boundary: unknown }[];
  try {
    await client.connect();
    const result = await client.query<{ name: string; osmType: "WAY" | "RELATION"; osmId: string; boundary: unknown }>(`
      SELECT c."name", c."osmType", c."osmId"::text AS "osmId", c."boundary"
      FROM "City" c WHERE EXISTS (SELECT 1 FROM "UserCity" uc WHERE uc."cityId" = c."id")
      ORDER BY c."osmType", c."osmId"
    `);
    rows = result.rows;
  } finally { await client.end(); }
  if (!rows.length) throw new Error("No tracked cities found; existing catalog was not replaced");

  const cities: CatalogCity[] = [];
  for (const city of rows) {
    const boundary = parseBoundary(city.boundary);
    if (!boundary) throw new Error(`Invalid stored boundary for ${city.osmType}/${city.osmId}`);
    console.log(`Building ${city.name} (${city.osmType}/${city.osmId})`);
    const keys = await buildRunnableKeys(boundary);
    cities.push(makeCatalogCity(city.osmType, city.osmId, boundary, keys));
    console.log(`  ${keys.length} network tiles`);
  }
  const destination = resolve("public", "data", "city-tiles.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  let written = false;
  try {
    await writeFile(temporary, `${JSON.stringify({ version: 1, cities })}\n`, { flag: "wx" });
    written = true;
    await rename(temporary, destination);
    written = false;
  } finally {
    if (written) await unlink(temporary);
  }
  console.log(`Wrote ${cities.length} city catalogs to ${destination}`);
}

main().catch((error: unknown) => {
  console.error("Could not build city catalogs:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
