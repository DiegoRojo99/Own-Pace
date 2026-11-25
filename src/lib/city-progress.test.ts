import { beforeEach, expect, it, vi } from "vitest";
import { CityCatalogUnavailableError, getCityProgress, prepareCityTiles } from "./city-progress";
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

it("reads only selected cities and hides readiness for stale or missing catalogs", async () => {
  const row = { id: "city", name: "City", label: "City, Country", ready: true, total: 10, explored: 3,
    osmType: "RELATION", osmId: 42n, boundary, fingerprint: catalog.fingerprint };
  mocks.query.mockResolvedValue([row, { ...row, id: "stale", fingerprint: "old" }]);
  expect(await getCityProgress("owner")).toEqual([
    { id: "city", name: "City", label: "City, Country", ready: true, available: true, total: 10, explored: 3 },
    { id: "stale", name: "City", label: "City, Country", ready: false, available: true, total: 10, explored: 3 },
  ]);
  expect(mocks.query.mock.calls[0].slice(1)).toEqual([TILE_ZOOM, TILE_ZOOM, "owner", "owner"]);
  mocks.catalog.mockReturnValue(null);
  expect((await getCityProgress("owner"))[0]).toMatchObject({ available: false, ready: false });
});

it("refuses preparation for untracked cities or a missing catalog without writing anything", async () => {
  mocks.findSelection.mockResolvedValueOnce(null).mockResolvedValueOnce({ city });
  expect(await prepareCityTiles("owner", "city")).toBeNull();
  mocks.catalog.mockReturnValue(null);
  await expect(prepareCityTiles("owner", "city")).rejects.toBeInstanceOf(CityCatalogUnavailableError);
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
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
  await expect(prepareCityTiles("owner", "city")).rejects.toBeInstanceOf(CityCatalogUnavailableError);
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
