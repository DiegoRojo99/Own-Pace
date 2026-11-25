import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { buildRunnableKeys } from "../src/lib/city-build-fetch";
import { boundaryHash, makeCatalogCity, parseCatalog, type CatalogCity } from "../src/lib/city-catalog-data";
import { parseBoundary } from "../src/lib/city-lookup-data";

async function readCatalog(destination: string): Promise<CatalogCity[]> {
  let contents: string;
  try {
    contents = await readFile(destination, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  return parseCatalog(JSON.parse(contents));
}

export async function buildCityTiles(args: string[]) {
  if (args.some((arg) => arg !== "--all") || args.length > 1) {
    throw new Error("Usage: npm run build:city-tiles (or npm run build:city-tiles:all to refresh all tracked cities)");
  }
  const rebuildAll = args.includes("--all");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to read tracked city boundaries");
  const destination = resolve("public", "data", "city-tiles.json");
  const existing = await readCatalog(destination);
  const cities = new Map(existing.map((city) => [`${city.osmType}/${city.osmId}`, city]));

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

  let built = 0;
  for (const city of rows) {
    const boundary = parseBoundary(city.boundary);
    if (!boundary) throw new Error(`Invalid stored boundary for ${city.osmType}/${city.osmId}`);
    const identity = `${city.osmType}/${city.osmId}`;
    const previous = cities.get(identity);
    if (!rebuildAll && previous?.boundaryHash === boundaryHash(boundary)) {
      console.log(`Skipping ${city.name} (${identity}): catalog is current`);
      continue;
    }
    console.log(`Building ${city.name} (${identity})`);
    const keys = await buildRunnableKeys(boundary);
    cities.set(identity, makeCatalogCity(city.osmType, city.osmId, boundary, keys));
    built++;
    console.log(`  ${keys.length} network tiles`);
  }
  if (!built) {
    console.log("All tracked city catalogs are current; nothing to write");
    return;
  }

  const temporary = `${destination}.${process.pid}.tmp`;
  await mkdir(dirname(destination), { recursive: true });
  let written = false;
  try {
    await writeFile(temporary, `${JSON.stringify({ version: 1, cities: [...cities.values()] })}\n`, { flag: "wx" });
    written = true;
    await rename(temporary, destination);
    written = false;
  } finally {
    if (written) await unlink(temporary);
  }
  console.log(`Built ${built} city catalogs; wrote ${cities.size} total to ${destination}`);
}
