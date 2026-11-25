import { beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { updateCityBoundary } from "./city-boundary";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn(), find: vi.fn(), remove: vi.fn(), update: vi.fn() }));
vi.mock("./db", () => {
  const tx = {
    $queryRaw: mocks.query,
    city: { findUnique: mocks.find, update: mocks.update },
    cityTile: { deleteMany: mocks.remove },
  };
  return { db: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

beforeEach(() => vi.resetAllMocks());

it("invalidates both the walking-network mask and the shared catalog on a boundary edit", async () => {
  mocks.find.mockResolvedValue({ id: "city" });
  const boundary = { type: "Polygon" as const, coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 40]]] };
  expect(await updateCityBoundary("city", boundary)).toBe(true);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { cityId: "city" } });
  expect(mocks.update).toHaveBeenCalledWith({
    where: { id: "city" },
    data: {
      boundary, boundaryFetchedAt: expect.any(Date), runnableTiles: Prisma.DbNull,
      tileZoom: null, tileNextX: null, tileNextY: null, tilesReady: false,
    },
  });
});
