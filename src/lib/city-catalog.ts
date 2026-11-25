import "server-only";
import data from "../../public/data/city-tiles.json";
import { parseBoundary } from "./city-lookup-data";
import { boundaryHash, parseCatalog } from "./city-catalog-data";

const cities = new Map(parseCatalog(data).map((city) => [`${city.osmType}/${city.osmId}`, city]));

export function precomputedCity(osmType: "WAY" | "RELATION", osmId: bigint | string, boundary: unknown) {
  const city = cities.get(`${osmType}/${osmId}`);
  const shape = parseBoundary(boundary);
  return city && shape && city.boundaryHash === boundaryHash(shape) ? city : null;
}

export function savedCatalogMatches(value: unknown, fingerprint: string) {
  return !!value && typeof value === "object" && "fingerprint" in value && value.fingerprint === fingerprint;
}
