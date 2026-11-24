import { beforeEach, expect, it, vi } from "vitest";
import { getCityProgress, prepareCityTiles } from "./city-progress";
import { tileToBounds, TILE_ZOOM } from "./tiles";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findSelection: vi.fn(), findSelections: vi.fn(), query: vi.fn(), cityFind: vi.fn(),
  tileCreate: vi.fn(), cityTileCreate: vi.fn(), cityTileDelete: vi.fn(), cityUpdate: vi.fn(),
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
  mocks.findSelection.mockResolvedValue({ cityId: "city" });
  mocks.cityFind.mockResolvedValueOnce({ tileZoom: null, tilesReady: false, tileNextX: null, tileNextY: null, boundary })
    .mockResolvedValueOnce({ tileZoom: TILE_ZOOM, tilesReady: true });
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.cityTileDelete).toHaveBeenCalledWith({ where: { cityId: "city" } });
  expect(mocks.tileCreate).toHaveBeenCalledWith({ data: [{ x, y, zoom: TILE_ZOOM }], skipDuplicates: true });
  expect(mocks.cityTileCreate).toHaveBeenCalledWith({ data: [{ cityId: "city", x, y, zoom: TILE_ZOOM }], skipDuplicates: true });
  expect(mocks.cityUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tilesReady: true, tileZoom: TILE_ZOOM }) }));
  expect(await prepareCityTiles("owner", "city")).toEqual({ done: true });
  expect(mocks.tileCreate).toHaveBeenCalledOnce();
});
