import { beforeEach, expect, it, vi } from "vitest";
import { getCityProgress, prepareCityTiles } from "./city-progress";
import { tileToBounds, TILE_ZOOM } from "./tiles";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findSelection: vi.fn(), findSelections: vi.fn(), query: vi.fn(), cityFind: vi.fn(),
  tileCreate: vi.fn(), cityTileCreate: vi.fn(), cityTileDelete: vi.fn(), cityUpdate: vi.fn(),
  fetchRunnable: vi.fn(),
}));
vi.mock("./city-overpass", async (importOriginal) => ({
  ...await importOriginal<typeof import("./city-overpass")>(), fetchRunnableTiles: mocks.fetchRunnable,
}));
vi.mock("./db", () => {
  const tx = {
    userCity: { findUnique: mocks.findSelection, findMany: mocks.findSelections },
    city: { findUniqueOrThrow: mocks.cityFind, update: mocks.cityUpdate },
    cityTile: { createMany: mocks.cityTileCreate, deleteMany: mocks.cityTileDelete },
    tile: { createMany: mocks.tileCreate },
    $queryRaw: mocks.query,
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([]);
});

it("reads only selected cities and uses this user's claimed tiles", async () => {
  mocks.query.mockResolvedValue([{ id: "city", name: "City", label: "City, Country", ready: true, total: 10, explored: 3 }]);
  expect(await getCityProgress("owner")).toEqual([{ id: "city", name: "City", label: "City, Country", ready: true, total: 10, explored: 3 }]);
  expect(mocks.query.mock.calls[0].slice(1)).toEqual([TILE_ZOOM, TILE_ZOOM, "owner", "owner"]);
});

it("refuses to prepare a city not selected by this user", async () => {
  mocks.findSelection.mockResolvedValue(null);
  expect(await prepareCityTiles("owner", "city")).toBeNull();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.tileCreate).not.toHaveBeenCalled();
});

it("writes and finishes a batch atomically, and skips completed cities", async () => {
  const { x, y } = { x: 65000, y: 49000 };
  const [[south, west], [north, east]] = tileToBounds(x, y, TILE_ZOOM);
  const boundary = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] };
  const city = { tileZoom: null, tilesReady: false, tileNextX: null, tileNextY: null, boundary, boundaryFetchedAt: new Date(), runnableTiles: null };
  mocks.findSelection.mockResolvedValue({ cityId: "city", city });
  mocks.fetchRunnable.mockResolvedValue({ zoom: TILE_ZOOM, keys: [`${x}/${y}`] });
  mocks.cityFind.mockResolvedValueOnce(city).mockResolvedValueOnce({ tileZoom: TILE_ZOOM, tilesReady: true });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledWith({ where: { cityId: "city" } });
  expect(mocks.tileCreate).toHaveBeenCalledWith({ data: [{ x, y, zoom: TILE_ZOOM }], skipDuplicates: true });
  expect(mocks.cityTileCreate).toHaveBeenCalledWith({ data: [{ cityId: "city", x, y, zoom: TILE_ZOOM }], skipDuplicates: true });
  expect(mocks.cityUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    tilesReady: true, tileZoom: TILE_ZOOM, runnableTiles: { zoom: TILE_ZOOM, keys: [`${x}/${y}`] },
  }) }));
  mocks.findSelection.mockResolvedValue({ cityId: "city", city: {
    ...city, tileZoom: TILE_ZOOM, tilesReady: true, runnableTiles: { zoom: TILE_ZOOM, keys: [`${x}/${y}`] },
  } });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.tileCreate).toHaveBeenCalledOnce();
  expect(mocks.fetchRunnable).toHaveBeenCalledOnce();
});

it.each([true, false])("rebuilds completed unfiltered catalogs, including concurrent legacy writes (initially ready: %s)", async (initiallyReady) => {
  const [[south, west], [north]] = tileToBounds(65000, 49000, TILE_ZOOM);
  const [, [, east]] = tileToBounds(65001, 49000, TILE_ZOOM);
  const city = {
    tileZoom: TILE_ZOOM, tilesReady: initiallyReady, tileNextX: null, tileNextY: null,
    boundaryFetchedAt: new Date(), runnableTiles: null,
    boundary: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
  mocks.findSelection.mockResolvedValue({ cityId: "city", city });
  mocks.cityFind.mockResolvedValue({ ...city, tilesReady: true });
  mocks.fetchRunnable.mockResolvedValue({ zoom: TILE_ZOOM, keys: ["65000/49000"] });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledWith({ where: { cityId: "city" } });
  expect(mocks.cityTileCreate).toHaveBeenCalledWith({
    data: [{ cityId: "city", x: 65000, y: 49000, zoom: TILE_ZOOM }], skipDuplicates: true,
  });
  expect(mocks.cityUpdate.mock.calls[0][0].data).toMatchObject({
    tilesReady: true, runnableTiles: { zoom: TILE_ZOOM, keys: ["65000/49000"] },
  });
});

it("filters inaccessible tiles and reuses the saved public mask without another request", async () => {
  const [[south, west], [north, east]] = tileToBounds(65000, 49000, TILE_ZOOM);
  const city = {
    tileZoom: null, tilesReady: false, tileNextX: null, tileNextY: null, boundaryFetchedAt: new Date(),
    runnableTiles: { zoom: TILE_ZOOM, keys: [] },
    boundary: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
  mocks.findSelection.mockResolvedValue({ cityId: "city", city });
  mocks.cityFind.mockResolvedValue(city);
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.tileCreate).not.toHaveBeenCalled();
  expect(mocks.fetchRunnable).not.toHaveBeenCalled();
});

it("does not save a mask after a concurrent boundary edit or an upstream failure", async () => {
  const boundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 40]]] };
  const city = { boundary, boundaryFetchedAt: new Date(1), runnableTiles: null };
  mocks.findSelection.mockResolvedValue({ cityId: "city", city });
  mocks.cityFind.mockResolvedValue({ ...city, boundaryFetchedAt: new Date(2) });
  mocks.fetchRunnable.mockResolvedValueOnce({ zoom: TILE_ZOOM, keys: [] });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(mocks.cityUpdate).not.toHaveBeenCalled();
  mocks.fetchRunnable.mockRejectedValueOnce(new Error("upstream"));
  await expect(prepareCityTiles("owner", "city")).rejects.toThrow("upstream");
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
});

it("resumes filtered row batches using the shared mask without another provider request", async () => {
  const [[south, west]] = tileToBounds(65000, 49011, TILE_ZOOM);
  const [, [north, east]] = tileToBounds(65002, 49000, TILE_ZOOM);
  const city = {
    tileZoom: TILE_ZOOM, tilesReady: false, tileNextX: 65000, tileNextY: 49000, boundaryFetchedAt: new Date(),
    runnableTiles: { zoom: TILE_ZOOM, keys: ["65000/49000", "65002/49010"] },
    boundary: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
  };
  mocks.findSelection.mockResolvedValue({ cityId: "city", city });
  mocks.cityFind.mockResolvedValueOnce(city).mockResolvedValueOnce({ ...city, tileNextX: 0, tileNextY: 49010 });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: false });
  expect(mocks.cityUpdate.mock.calls[0][0].data).toMatchObject({ tileNextX: 0, tileNextY: 49010, tilesReady: false });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileCreate.mock.calls.map(([args]) => args.data)).toEqual([
    [{ cityId: "city", zoom: TILE_ZOOM, x: 65000, y: 49000 }],
    [{ cityId: "city", zoom: TILE_ZOOM, x: 65002, y: 49010 }],
  ]);
  expect(mocks.cityTileDelete).not.toHaveBeenCalled();
  expect(mocks.fetchRunnable).not.toHaveBeenCalled();
});
