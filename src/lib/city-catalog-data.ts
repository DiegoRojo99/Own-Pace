import { createHash } from "node:crypto";
import type { CityBoundary } from "./city-lookup-data";
import { TILE_ZOOM } from "./tiles";

export type CatalogCity = {
  osmType: "WAY" | "RELATION";
  osmId: string;
  boundaryHash: string;
  fingerprint: string;
  zoom: number;
  keys: string[];
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function boundaryHash(boundary: CityBoundary) {
  return hash([boundary.type, boundary.coordinates]);
}

export function makeCatalogCity(osmType: CatalogCity["osmType"], osmId: string, boundary: CityBoundary, keys: string[]): CatalogCity {
  const shape = boundaryHash(boundary);
  const sortedKeys = [...new Set(keys)].sort();
  return {
    osmType, osmId, boundaryHash: shape, zoom: TILE_ZOOM, keys: sortedKeys,
    fingerprint: hash([1, osmType, osmId, shape, TILE_ZOOM, sortedKeys]),
  };
}

export function parseCatalog(value: unknown): CatalogCity[] {
  if (!value || typeof value !== "object" || !("version" in value) || value.version !== 1 ||
      !("cities" in value) || !Array.isArray(value.cities)) throw new Error("Invalid precomputed city catalog");
  const cities: CatalogCity[] = [];
  const seen = new Set<string>();
  for (const entry of value.cities) {
    if (!entry || typeof entry !== "object" || (entry.osmType !== "WAY" && entry.osmType !== "RELATION") ||
        typeof entry.osmId !== "string" || !/^[1-9]\d{0,18}$/.test(entry.osmId) ||
        typeof entry.boundaryHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.boundaryHash) ||
        typeof entry.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(entry.fingerprint) ||
        entry.zoom !== TILE_ZOOM || !Array.isArray(entry.keys) || entry.keys.length > 250_000 ||
        !entry.keys.every((key: unknown) => {
          if (typeof key !== "string" || !/^(0|[1-9]\d*)\/(0|[1-9]\d*)$/.test(key)) return false;
          const [x, y] = key.split("/").map(Number);
          return x < 2 ** TILE_ZOOM && y < 2 ** TILE_ZOOM;
        })) throw new Error("Invalid precomputed city catalog entry");
    const identity = `${entry.osmType}/${entry.osmId}`;
    if (seen.has(identity) || new Set(entry.keys).size !== entry.keys.length ||
        entry.fingerprint !== hash([1, entry.osmType, entry.osmId, entry.boundaryHash, entry.zoom, entry.keys])) {
      throw new Error("Invalid precomputed city catalog fingerprint");
    }
    seen.add(identity);
    cities.push(entry);
  }
  return cities;
}
