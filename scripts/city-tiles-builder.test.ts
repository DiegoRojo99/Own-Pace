import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { makeCatalogCity, parseCatalog } from "../src/lib/city-catalog-data";
import type { CityBoundary } from "../src/lib/city-lookup-data";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  mkdir: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  build: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile, writeFile: mocks.writeFile, rename: mocks.rename,
  unlink: mocks.unlink, mkdir: mocks.mkdir,
}));
vi.mock("pg", () => ({
  Client: class {
    connect = mocks.connect;
    query = mocks.query;
    end = mocks.end;
  },
}));
vi.mock("../src/lib/city-build-fetch", () => ({ buildRunnableKeys: mocks.build }));

import { buildCityTiles } from "./city-tiles-builder";

const boundary: CityBoundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 40]]] };
const changed: CityBoundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 42], [-3, 40]]] };
const row = (osmId: string, shape: CityBoundary = boundary) => ({ name: `City ${osmId}`, osmType: "RELATION", osmId, boundary: shape });
const catalog = (osmId: string, shape: CityBoundary = boundary) => makeCatalogCity("RELATION", osmId, shape, ["1/2"]);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, cities: [] }));
  mocks.query.mockResolvedValue({ rows: [row("1")] });
  mocks.build.mockResolvedValue(["3/4"]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("builds missing and boundary-changed cities, preserving current and untracked entries", async () => {
  const unchanged = catalog("1");
  const untracked = catalog("4");
  mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, cities: [unchanged, catalog("2"), untracked] }));
  mocks.query.mockResolvedValue({ rows: [row("1"), row("2", changed), row("3")] });
  await buildCityTiles([]);
  expect(mocks.build.mock.calls).toEqual([[changed], [boundary]]);
  const result = parseCatalog(JSON.parse(mocks.writeFile.mock.calls[0][1]));
  expect(result).toEqual([unchanged, catalogWithKeys("2", changed), untracked, catalogWithKeys("3", boundary)]);
  expect(mocks.rename).toHaveBeenCalledOnce();
  expect(mocks.query.mock.calls[0][0]).toContain('FROM "UserCity"');
});

function catalogWithKeys(osmId: string, shape: CityBoundary) {
  return makeCatalogCity("RELATION", osmId, shape, ["3/4"]);
}

it("skips an existing catalog, including an empty one, without writing", async () => {
  const empty = makeCatalogCity("RELATION", "1", boundary, []);
  mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, cities: [empty] }));
  await buildCityTiles([]);
  expect(mocks.build).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});

it("refreshes tracked cities with --all and preserves untracked entries", async () => {
  const untracked = catalog("2");
  mocks.readFile.mockResolvedValue(JSON.stringify({ version: 1, cities: [catalog("1"), untracked] }));
  await buildCityTiles(["--all"]);
  expect(mocks.build).toHaveBeenCalledOnce();
  expect(parseCatalog(JSON.parse(mocks.writeFile.mock.calls[0][1]))).toEqual([
    catalogWithKeys("1", boundary), untracked,
  ]);
});

it("builds from scratch when the catalog does not exist", async () => {
  mocks.readFile.mockRejectedValue(Object.assign(new Error("not found"), { code: "ENOENT" }));
  await buildCityTiles([]);
  expect(parseCatalog(JSON.parse(mocks.writeFile.mock.calls[0][1]))).toEqual([catalogWithKeys("1", boundary)]);
});

it("leaves the previous catalog intact if a build fails", async () => {
  mocks.query.mockResolvedValue({ rows: [row("1"), row("2")] });
  mocks.build.mockResolvedValueOnce(["3/4"]).mockRejectedValueOnce(new Error("Overpass failed"));
  await expect(buildCityTiles([])).rejects.toThrow("Overpass failed");
  expect(mocks.writeFile).not.toHaveBeenCalled();
  expect(mocks.rename).not.toHaveBeenCalled();
});

it("rejects invalid catalogs and unknown arguments before querying or writing", async () => {
  mocks.readFile.mockResolvedValue('{"version":2,"cities":[]}');
  await expect(buildCityTiles([])).rejects.toThrow("Invalid precomputed city catalog");
  await expect(buildCityTiles(["--invalid"])).rejects.toThrow("Usage:");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.writeFile).not.toHaveBeenCalled();
});
