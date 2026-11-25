import type { CityBoundary } from "./city-lookup-data";
import { runnableTileKeys } from "./city-walkability";
import { osmResponseText, osmRetrySeconds, OSM_USER_AGENT } from "./osm-response";
import { overpassQuery } from "./overpass-query";
import { TILE_ZOOM } from "./tiles";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export async function buildRunnableKeys(boundary: CityBoundary, configured = process.env.CITY_OVERPASS_URL): Promise<string[]> {
  const endpoints = [...new Set([...(configured ? [configured] : []), ...MIRRORS])];
  for (const endpoint of endpoints) {
    if (!URL.canParse(endpoint)) throw new Error("Invalid CITY_OVERPASS_URL");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Overpass endpoints must be HTTPS URLs without credentials, query, or fragment");
    }
  }
  const failures: string[] = [];
  for (const endpoint of endpoints) {
    let wait = 0;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "User-Agent": OSM_USER_AGENT, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery(boundary) }),
        signal: AbortSignal.timeout(25_000), redirect: "error", cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 429) wait = Math.max(30, osmRetrySeconds(response));
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      const data: unknown = JSON.parse(await osmResponseText(response, 32 * 1024 * 1024));
      return runnableTileKeys(data, boundary, TILE_ZOOM);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failures.push(`${new URL(endpoint).host}: ${message}`);
      console.warn(`Overpass ${new URL(endpoint).host} failed: ${message}`);
    }
    if (wait && endpoint !== endpoints[endpoints.length - 1]) await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  }
  throw new Error(`All Overpass endpoints failed: ${failures.join("; ")}`);
}
