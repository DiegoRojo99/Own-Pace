import { expect, it } from "vitest";
import { boundaryHash, makeCatalogCity, parseCatalog } from "./city-catalog-data";
import type { CityBoundary } from "./city-lookup-data";

const boundary: CityBoundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 40]]] };

it("creates deterministic catalogs tied to both boundary and actual network tiles", () => {
  const first = makeCatalogCity("RELATION", "42", boundary, ["3/4", "1/2", "3/4"]);
  expect(parseCatalog({ version: 1, cities: [first] })).toEqual([first]);
  expect(first.keys).toEqual(["1/2", "3/4"]);
  expect(makeCatalogCity("RELATION", "42", boundary, ["3/4", "1/2"]).fingerprint).toBe(first.fingerprint);
  expect(makeCatalogCity("RELATION", "42", boundary, ["1/2"]).fingerprint).not.toBe(first.fingerprint);
  expect(boundaryHash({ type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 42], [-3, 40]]] })).not.toBe(first.boundaryHash);
});

it("rejects tampered, malformed and duplicate catalogs", () => {
  const city = makeCatalogCity("RELATION", "42", boundary, ["3/4"]);
  expect(() => parseCatalog({ version: 1, cities: [{ ...city, keys: ["3/5"] }] })).toThrow();
  expect(() => parseCatalog({ version: 1, cities: [city, city] })).toThrow();
  expect(() => parseCatalog({ version: 2, cities: [] })).toThrow();
  expect(() => parseCatalog({ version: 1, cities: [{ ...city, keys: ["131072/0"] }] })).toThrow();
});
