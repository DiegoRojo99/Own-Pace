import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { isCityCandidate, parseBoundary, parseCandidate, type CityCandidate } from "./city-lookup-data";

const SEARCH_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const USER_AGENT = "OwnPace/0.2 (https://github.com/DiegoRojo99/Own-Pace)";

export class CityLookupError extends Error {
  constructor(public code: "invalid" | "rate-limit" | "upstream" | "no-boundary") {
    super(code);
  }
}

function providerUrl() {
  const url = new URL(process.env.CITY_NOMINATIM_URL || "https://nominatim.openstreetmap.org/");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new CityLookupError("upstream");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function responseText(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new CityLookupError("upstream");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new CityLookupError("upstream");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function retrySeconds(response: Response) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return 60;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isSafeInteger(seconds) && seconds > 0 ? Math.max(1, seconds) : 60;
}

function cacheKey(kind: "search" | "lookup", value: string) {
  return createHash("sha256").update(`${providerUrl().href}\n${kind}\n${value}`).digest("hex");
}

async function cacheResults(key: string, results: CityCandidate[]) {
  const expiresAt = new Date(Date.now() + SEARCH_CACHE_MS);
  await db.cityLookupCache.upsert({
    where: { key }, create: { key, results, expiresAt }, update: { results, expiresAt },
  });
}

async function nominatim(path: "search" | "lookup", params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, providerUrl());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  // The shared lease applies across all signed-in users and server instances.
  const leaseId = randomUUID();
  const lease = await db.$queryRaw<{ leaseId: string }[]>`
    INSERT INTO "CityLookupRateLimit" ("id", "leaseId", "blockedUntil")
    VALUES (1, ${leaseId}, clock_timestamp() + INTERVAL '30 seconds')
    ON CONFLICT ("id") DO UPDATE SET "leaseId" = EXCLUDED."leaseId", "blockedUntil" = EXCLUDED."blockedUntil"
    WHERE "CityLookupRateLimit"."blockedUntil" <= clock_timestamp()
    RETURNING "leaseId"
  `;
  if (!lease.length) throw new CityLookupError("rate-limit");
  let cooldown = 1;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Language": "en" },
      signal: AbortSignal.timeout(8_000), redirect: "error", cache: "no-store",
    });
    if (response.status === 429) {
      cooldown = retrySeconds(response);
      await response.body?.cancel();
      throw new CityLookupError("rate-limit");
    }
    if (!response.ok) throw new CityLookupError("upstream");
    const text = await responseText(response);
    try { return JSON.parse(text); } catch { throw new CityLookupError("upstream"); }
  } catch (error) {
    if (error instanceof CityLookupError) throw error;
    throw new CityLookupError("upstream");
  } finally {
    // A crashed request keeps its lease; an old request cannot release a newer lease.
    await db.$executeRaw`
      UPDATE "CityLookupRateLimit"
      SET "blockedUntil" = clock_timestamp() + (${cooldown} * INTERVAL '1 second')
      WHERE "id" = 1 AND "leaseId" = ${leaseId}
    `;
  }
}

/** Search public city boundaries without storing the user's search text. */
export async function searchCities(query: string): Promise<CityCandidate[]> {
  const term = query.trim().replace(/\s+/g, " ");
  if (term.length < 2 || term.length > 100 || /[\u0000-\u001f\u007f]/.test(term)) throw new CityLookupError("invalid");
  const key = cacheKey("search", term.toLowerCase());
  // Search results are shared public OSM data, not user activity data.
  const cached = await db.cityLookupCache.findUnique({ where: { key } });
  if (cached && cached.expiresAt > new Date()) {
    if (!Array.isArray(cached.results) || !cached.results.every(isCityCandidate)) throw new CityLookupError("upstream");
    return cached.results;
  }
  const data = await nominatim("search", {
    q: term, format: "jsonv2", featureType: "city", addressdetails: "1", dedupe: "0", limit: "20",
  });
  if (!Array.isArray(data)) throw new CityLookupError("upstream");
  const results: CityCandidate[] = [];
  const seen = new Set<string>();
  for (const item of data) {
    const candidate = parseCandidate(item);
    if (!candidate) continue;
    const id = `${candidate.osmType}/${candidate.osmId}`;
    if (!seen.has(id)) { results.push(candidate); seen.add(id); }
  }
  await cacheResults(key, results);
  return results;
}

/** Cache a selected public OSM boundary; no user activity information is sent to OSM. */
export async function selectCity(osmType: "WAY" | "RELATION", osmId: string) {
  if (!isCityCandidate({ osmType, osmId, name: "x", label: "x" })) throw new CityLookupError("invalid");
  const id = BigInt(osmId);
  // City boundaries are shared public data; this query contains no user claims.
  const existing = await db.city.findUnique({ where: { osmType_osmId: { osmType, osmId: id } } });
  if (existing) {
    if (!parseBoundary(existing.boundary)) throw new CityLookupError("upstream");
    return { name: existing.name };
  }
  const key = cacheKey("lookup", `${osmType}/${osmId}`);
  const cached = await db.cityLookupCache.findUnique({ where: { key } });
  if (cached && cached.expiresAt > new Date()) {
    if (!Array.isArray(cached.results) || cached.results.length !== 0) throw new CityLookupError("upstream");
    throw new CityLookupError("no-boundary");
  }
  const data = await nominatim("lookup", {
    osm_ids: `${osmType === "WAY" ? "W" : "R"}${osmId}`,
    format: "jsonv2", polygon_geojson: "1", addressdetails: "1",
  });
  if (!Array.isArray(data) || data.length > 1) throw new CityLookupError("upstream");
  if (data.length === 0) {
    await cacheResults(key, []);
    throw new CityLookupError("no-boundary");
  }
  const candidate = parseCandidate(data[0]);
  const boundary = typeof data[0] === "object" && data[0] !== null ? parseBoundary(data[0].geojson) : null;
  if (!candidate || !boundary) {
    await cacheResults(key, []);
    throw new CityLookupError("no-boundary");
  }
  if (candidate.osmType !== osmType || candidate.osmId !== osmId) throw new CityLookupError("upstream");
  const city = await db.city.upsert({
    where: { osmType_osmId: { osmType, osmId: id } },
    create: { osmType, osmId: id, name: candidate.name, boundary },
    update: {},
    select: { name: true },
  });
  return city;
}
