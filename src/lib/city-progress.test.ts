import { beforeEach, expect, it, vi } from "vitest";
import { getCityProgress, prepareCityTiles } from "./city-progress";
import { cityTileSource } from "./city-catalog-data";
import { tileToBounds, TILE_ZOOM } from "./tiles";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findSelection: vi.fn(), query: vi.fn(), cityFind: vi.fn(), catalog: vi.fn(),
  tileCreate: vi.fn(), cityTileCreate: vi.fn(), cityTileDelete: vi.fn(), cityUpdate: vi.fn(),
}));
vi.mock("./city-catalog", () => ({
  precomputedCity: mocks.catalog,
  savedCatalogMatches: (value: { fingerprint?: string } | null, fingerprint: string) => value?.fingerprint === fingerprint,
}));
vi.mock("./db", () => {
  const tx = {
    userCity: { findUnique: mocks.findSelection },
    city: { findUniqueOrThrow: mocks.cityFind, update: mocks.cityUpdate },
    cityTile: { createMany: mocks.cityTileCreate, deleteMany: mocks.cityTileDelete },
    tile: { createMany: mocks.tileCreate },
    $queryRaw: mocks.query,
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

const catalog = { osmType: "RELATION", osmId: "42", fingerprint: "catalog-v1", zoom: TILE_ZOOM, keys: ["65000/49000"] };
const [[south, west], [north, east]] = tileToBounds(65000, 49000, TILE_ZOOM);
const boundary = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
const city = { osmType: "RELATION", osmId: 42n, boundary, boundaryFetchedAt: new Date(1),
  tileZoom: TILE_ZOOM, tilesReady: true, tileNextX: null, tileNextY: null, runnableTiles: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([]);
  mocks.catalog.mockReturnValue(catalog);
});

it("reads selected cities and checks readiness against the current tile source", async () => {
  const row = { id: "city", name: "City", label: "City, Country", ready: true, total: 10, explored: 3,
    osmType: "RELATION", osmId: 42n, boundary, fingerprint: catalog.fingerprint };
  mocks.query.mockResolvedValue([row, { ...row, id: "stale", fingerprint: "old" }]);
  expect(await getCityProgress("owner")).toEqual([
    { id: "city", name: "City", label: "City, Country", ready: true, filtered: true, total: 10, explored: 3 },
    { id: "stale", name: "City", label: "City, Country", ready: false, filtered: true, total: 10, explored: 3 },
  ]);
  expect(mocks.query.mock.calls[0].slice(1)).toEqual([TILE_ZOOM, TILE_ZOOM, "owner", "owner"]);
  mocks.catalog.mockReturnValue(null);
  mocks.query.mockResolvedValue([{ ...row, fingerprint: cityTileSource(boundary, null).fingerprint }, row]);
  expect(await getCityProgress("owner")).toMatchObject([
    { filtered: false, ready: true }, { filtered: false, ready: false },
  ]);
});

it("refuses preparation for untracked cities without writing anything", async () => {
  mocks.findSelection.mockResolvedValueOnce(null);
  expect(await prepareCityTiles("owner", "city")).toBeNull();
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
});

it("builds boundary tiles without a catalog and reuses them when complete", async () => {
  mocks.catalog.mockReturnValue(null);
  mocks.findSelection.mockResolvedValue({ city });
  mocks.cityFind.mockResolvedValue(city);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate).toHaveBeenCalledWith({
    data: [{ cityId: "city", x: 65000, y: 49000, zoom: TILE_ZOOM }], skipDuplicates: true,
  });
  const marker = { fingerprint: cityTileSource(boundary, null).fingerprint };
  expect(mocks.cityUpdate.mock.calls[0][0].data).toMatchObject({ tilesReady: true, runnableTiles: marker });
  mocks.findSelection.mockResolvedValue({ city: { ...city, runnableTiles: marker } });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate).toHaveBeenCalledOnce();
});

it("replaces boundary tiles with only catalog tiles when filtering is deployed", async () => {
  const [, [, right]] = tileToBounds(65001, 49000, TILE_ZOOM);
  const shape = { type: "Polygon", coordinates: [[[west, south], [right, south], [right, north], [west, north], [west, south]]] };
  const initial = { ...city, boundary: shape, runnableTiles: null };
  mocks.catalog.mockReturnValue(null);
  mocks.findSelection.mockResolvedValue({ city: initial });
  mocks.cityFind.mockResolvedValue(initial);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate.mock.calls[0][0].data).toEqual([
    { cityId: "city", x: 65000, y: 49000, zoom: TILE_ZOOM },
    { cityId: "city", x: 65001, y: 49000, zoom: TILE_ZOOM },
  ]);
  const prepared = { ...initial, runnableTiles: mocks.cityUpdate.mock.calls[0][0].data.runnableTiles };
  mocks.findSelection.mockResolvedValue({ city: prepared });
  mocks.cityFind.mockResolvedValue(prepared);
  mocks.catalog.mockReturnValue(catalog);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledTimes(2);
  expect(mocks.cityTileCreate.mock.calls[1][0].data).toEqual([
    { cityId: "city", x: 65000, y: 49000, zoom: TILE_ZOOM },
  ]);
  expect(mocks.cityUpdate.mock.calls[1][0].data.runnableTiles).toEqual(catalog);
});

it("rebuilds old catalogs using the static network and reuses a matching completed catalog", async () => {
  mocks.findSelection.mockResolvedValue({ city });
  mocks.cityFind.mockResolvedValue(city);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledWith({ where: { cityId: "city" } });
  expect(mocks.tileCreate).toHaveBeenCalledWith({ data: [{ x: 65000, y: 49000, zoom: TILE_ZOOM }], skipDuplicates: true });
  expect(mocks.cityTileCreate).toHaveBeenCalledWith({
    data: [{ cityId: "city", x: 65000, y: 49000, zoom: TILE_ZOOM }], skipDuplicates: true,
  });
  expect(mocks.cityUpdate.mock.calls[0][0].data).toMatchObject({ tilesReady: true, runnableTiles: catalog });
  mocks.findSelection.mockResolvedValue({ city: { ...city, runnableTiles: catalog } });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.tileCreate).toHaveBeenCalledOnce();
});

it("does not commit a stale catalog when the boundary changes during preparation", async () => {
  mocks.findSelection.mockResolvedValue({ city });
  mocks.cityFind.mockResolvedValue({ ...city, boundaryFetchedAt: new Date(2) });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(mocks.cityUpdate).not.toHaveBeenCalled();
  mocks.catalog.mockReturnValueOnce(catalog).mockReturnValueOnce(null);
  mocks.cityFind.mockResolvedValue(city);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(mocks.cityUpdate).not.toHaveBeenCalled();
});

it("restarts partially built catalogs when a newer network is deployed", async () => {
  mocks.findSelection.mockResolvedValue({ city: { ...city, tilesReady: false, tileNextX: 9, tileNextY: 9,
    runnableTiles: { ...catalog, fingerprint: "old" } } });
  mocks.cityFind.mockResolvedValue({ ...city, tilesReady: false, tileNextX: 9, tileNextY: 9,
    runnableTiles: { ...catalog, fingerprint: "old" } });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledOnce();
  expect(mocks.cityTileCreate).toHaveBeenCalledOnce();
});

it("resumes batches for the same catalog without clearing previous tiles", async () => {
  const [[bottom, left]] = tileToBounds(65000, 49011, TILE_ZOOM);
  const [, [top, right]] = tileToBounds(65002, 49000, TILE_ZOOM);
  const shape = { type: "Polygon", coordinates: [[[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]] };
  const mask = { ...catalog, keys: ["65000/49000", "65002/49010"] };
  const ongoing = { ...city, boundary: shape, tilesReady: false, tileNextX: 65000, tileNextY: 49000, runnableTiles: mask };
  mocks.catalog.mockReturnValue(mask);
  mocks.findSelection.mockResolvedValue({ city: ongoing });
  mocks.cityFind.mockResolvedValueOnce(ongoing).mockResolvedValueOnce({ ...ongoing, tileNextX: 0, tileNextY: 49010 });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate.mock.calls.map(([args]) => args.data)).toEqual([
    [{ cityId: "city", zoom: TILE_ZOOM, x: 65000, y: 49000 }],
    [{ cityId: "city", zoom: TILE_ZOOM, x: 65002, y: 49010 }],
  ]);
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
});

it("resumes boundary-only batches without clearing previous tiles", async () => {
  const [[bottom, left]] = tileToBounds(65000, 49011, TILE_ZOOM);
  const [, [top, right]] = tileToBounds(65002, 49000, TILE_ZOOM);
  const shape = { type: "Polygon", coordinates: [[[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]]] };
  const marker = { fingerprint: cityTileSource(shape, null).fingerprint };
  const ongoing = { ...city, boundary: shape, tilesReady: false, tileNextX: 65000, tileNextY: 49000, runnableTiles: marker };
  mocks.catalog.mockReturnValue(null);
  mocks.findSelection.mockResolvedValue({ city: ongoing });
  mocks.cityFind.mockResolvedValueOnce(ongoing).mockResolvedValueOnce({ ...ongoing, tileNextX: 0, tileNextY: 49010 });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate.mock.calls[0][0].data.length).toBeGreaterThan(1);
  expect(mocks.cityTileCreate).toHaveBeenCalledTimes(2);
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
  expect(mocks.cityUpdate.mock.calls[0][0].data).not.toHaveProperty("runnableTiles");
});
