import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { CityBoundary } from "./city-lookup-data";
import { runnableTileKeys, RUNNABLE_HIGHWAYS, walkabilityBounds } from "./city-walkability";
import { OSM_USER_AGENT, osmResponseText } from "./osm-response";
import { TILE_ZOOM } from "./tiles";

export class CityWalkabilityError extends Error {
  constructor(public code: "rate-limit" | "upstream") { super(`OSM walkability ${code}`); }
}

export function overpassQuery(boundary: CityBoundary) {
  const filters = [
    '["landuse"="military"]', '["military"]',
    '["access"~"^(private|no|military)$"]', '["foot"~"^(private|no|military)$"]',
    '["natural"="water"]', '["waterway"~"^(river|riverbank)$"]',
  ];
  const selectors = [
    `way["highway"~"^(${RUNNABLE_HIGHWAYS.join("|")})$"]`,
    ...filters.flatMap((filter) => [`way${filter}`, `rel${filter}`]),
  ];
  const boxes = walkabilityBounds(boundary);
  const queries = boxes.flatMap((box) => selectors.map((selector) => `${selector}(${box.join(",")});`));
  // is_in also finds a large restricted polygon completely surrounding the city's bounds.
  const enclosing = boxes.map(([south, west, north, east], index) =>
    `is_in(${(south + north) / 2},${(west + east) / 2})->.enclosing${index};
    (${filters.flatMap((filter) => [`area.enclosing${index}${filter};`, `way.enclosing${index}${filter};`]).join("")})->.areas${index};`);
  const pivots = enclosing.map((_, index) => `way.areas${index};way(pivot.areas${index});rel(pivot.areas${index});`).join("");
  return `[out:json][timeout:20];${enclosing.join("\n")}(${queries.join("")}${pivots});out geom;`;
}

/** Fetch only public OSM data, never activity routes or user identifiers. */
export async function fetchRunnableTiles(boundary: CityBoundary): Promise<{ zoom: number; keys: string[] }> {
  const provider = process.env.CITY_OVERPASS_URL || "https://overpass-api.de/api/interpreter";
  if (!URL.canParse(provider)) throw new CityWalkabilityError("upstream");
  const url = new URL(provider);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new CityWalkabilityError("upstream");
  const leaseId = randomUUID();
  const lease = await db.$queryRaw<{ leaseId: string }[]>`
    INSERT INTO "CityLookupRateLimit" ("id", "leaseId", "blockedUntil")
    VALUES (2, ${leaseId}, clock_timestamp() + INTERVAL '45 seconds')
    ON CONFLICT ("id") DO UPDATE SET "leaseId" = EXCLUDED."leaseId", "blockedUntil" = EXCLUDED."blockedUntil"
    WHERE "CityLookupRateLimit"."blockedUntil" <= clock_timestamp()
    RETURNING "leaseId"
  `;
  if (!lease.length) throw new CityWalkabilityError("rate-limit");
  let cooldown = 1;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": OSM_USER_AGENT, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: overpassQuery(boundary) }),
      signal: AbortSignal.timeout(25_000), redirect: "error", cache: "no-store",
    });
    if (response.status === 429 || response.status === 504) {
      const retry = response.headers.get("retry-after") ?? "";
      const seconds = /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000);
      cooldown = Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 60;
      await response.body?.cancel();
      throw new CityWalkabilityError("rate-limit");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new CityWalkabilityError("upstream");
    }
    const data: unknown = JSON.parse(await osmResponseText(response, 32 * 1024 * 1024));
    return { zoom: TILE_ZOOM, keys: runnableTileKeys(data, boundary, TILE_ZOOM) };
  } catch (error) {
    if (error instanceof CityWalkabilityError) throw error;
    console.error("Could not load OSM walkability:", error instanceof Error ? error.message : "UnknownError");
    throw new CityWalkabilityError("upstream");
  } finally {
    await db.$executeRaw`
      UPDATE "CityLookupRateLimit"
      SET "blockedUntil" = clock_timestamp() + (${cooldown} * INTERVAL '1 second')
      WHERE "id" = 2 AND "leaseId" = ${leaseId}
    `;
  }
}

export function cachedRunnableTiles(value: unknown): Set<string> | null {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("zoom" in value) ||
      typeof value.zoom !== "number" || !Number.isInteger(value.zoom) || value.zoom < 0 || value.zoom > 22 ||
      !("keys" in value) || !Array.isArray(value.keys)) throw new Error("Stored city walkability is invalid");
  const zoom = value.zoom;
  if (!value.keys.every((key): key is string => {
    if (typeof key !== "string" || !/^\d+\/\d+$/.test(key)) return false;
    const [x, y] = key.split("/").map(Number);
    return x < 2 ** zoom && y < 2 ** zoom;
  })) throw new Error("Stored city walkability is invalid");
  if (zoom !== TILE_ZOOM) return null;
  return new Set(value.keys);
}
