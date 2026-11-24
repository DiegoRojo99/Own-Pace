import { beforeEach, expect, it, vi } from "vitest";
import { processActivityTiles, processPendingActivities, resetExplorer } from "./explorer";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  query: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(),
}));
vi.mock("./db", () => {
  const tx = {
    $queryRaw: mocks.query,
    activity: { findFirst: mocks.findFirst, updateMany: mocks.updateMany, findMany: mocks.findMany, count: mocks.count },
    userTile: { deleteMany: mocks.deleteMany },
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.query.mockResolvedValue([]);
});

it("claims each activity once and scopes the claim to its owner", async () => {
  mocks.findFirst.mockResolvedValueOnce({ id: "run", startDate: new Date("2026-01-01"), summaryPolyline: "??" }).mockResolvedValueOnce(null);
  mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ x: 8192, y: 8192, inserted: true }]).mockResolvedValueOnce([]);
  expect(await processActivityTiles({ id: "run", userId: "owner" })).toEqual(["8192/8192"]);
  expect(await processActivityTiles({ id: "run", userId: "owner" })).toEqual([]);
  expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ id: "run", userId: "owner", tilesProcessed: false }),
  }));
  expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "run", userId: "owner" }, data: { tilesProcessed: true } });
});

it("marks malformed routes as skipped without writing tiles", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    mocks.findFirst.mockResolvedValue({ id: "run", startDate: new Date(), summaryPolyline: "_" });
    expect(await processActivityTiles({ id: "run", userId: "owner" })).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
  } finally { log.mockRestore(); }
});

it("limits pending work and restricts reset to the owner", async () => {
  mocks.findMany.mockResolvedValue([]);
  mocks.count.mockResolvedValue(0);
  expect(await processPendingActivities("owner", 100)).toEqual({ processed: 0, remaining: 0 });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ userId: "owner", tilesProcessed: false }),
    orderBy: [{ startDate: "asc" }, { id: "asc" }], take: 50,
  }));
  await resetExplorer("owner");
  expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner" } });
  expect(mocks.updateMany).toHaveBeenCalledWith({ where: { userId: "owner" }, data: { tilesProcessed: false } });
});
