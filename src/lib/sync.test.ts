import { beforeEach, expect, it, vi } from "vitest";
import { syncRuns } from "./sync";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  updateUser: vi.fn(),
  findRuns: vi.fn(),
  createRuns: vi.fn(),
  updateRun: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./strava", async (importOriginal) => ({
  ...await importOriginal<typeof import("./strava")>(),
  stravaFetch: mocks.fetch,
}));

vi.mock("./db", () => {
  const tx = {
    user: { findUnique: mocks.findUser, updateMany: mocks.updateUser },
    activity: { findMany: mocks.findRuns, createMany: mocks.createRuns, update: mocks.updateRun },
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

const startedAt = "2026-03-19T13:05:00Z";
const newest = Date.parse(startedAt) / 1000;
const state = { syncCursor: null, syncBefore: null, syncPage: 1, syncNewest: null, syncVersion: 0 };
const run = {
  id: "9007199254740993",
  type: "Run",
  sport_type: "TrailRun",
  name: "Evening trail",
  start_date: startedAt,
  distance: 3000,
  moving_time: 1200,
  elapsed_time: 1300,
  total_elevation_gain: 50,
  average_speed: 2.5,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUser.mockResolvedValue(state);
  mocks.updateUser.mockResolvedValue({ count: 1 });
  mocks.findRuns.mockResolvedValue([]);
  mocks.createRuns.mockResolvedValue({ count: 1 });
});

it("keeps the query window fixed through completion and advances through non-runs", async () => {
  const before = newest + 1800;
  const existingCursor = newest - 600;
  const clock = vi.spyOn(Date, "now").mockReturnValue(before * 1000);
  try {
    mocks.findUser.mockResolvedValueOnce({ ...state, syncCursor: existingCursor });
    const ride = { start_date: new Date((newest + 20) * 1000).toISOString(), type: "Ride" };
    const virtual = { ...run, type: "Run", sport_type: "VirtualRun" };
    mocks.fetch.mockResolvedValueOnce([run, virtual, ...Array.from({ length: 98 }, () => ride)]);
    await expect(syncRuns("runner")).resolves.toEqual({ count: 1, more: true });
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "runner", "/athlete/activities",
      { before, after: existingCursor - 1, page: 1, per_page: 100 });
    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, {
      where: { id: "runner", syncVersion: 0 },
      data: { syncVersion: { increment: 1 }, syncBefore: before, syncPage: 2, syncNewest: newest + 20 },
    });
    expect(mocks.createRuns).toHaveBeenCalledOnce();
    expect(mocks.createRuns).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        userId: "runner", stravaId: 9007199254740993n, type: "TrailRun", averageHeartrate: null,
      })],
      skipDuplicates: true,
    });

    clock.mockReturnValue((before + 3600) * 1000);
    mocks.findUser.mockResolvedValueOnce({
      ...state, syncBefore: before, syncCursor: existingCursor, syncPage: 2,
      syncNewest: newest + 20, syncVersion: 1,
    });
    mocks.fetch.mockResolvedValueOnce([]);
    await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: false });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "runner", "/athlete/activities",
      expect.objectContaining({ before, after: existingCursor - 1, page: 2 }));
    expect(mocks.updateUser).toHaveBeenNthCalledWith(2, {
      where: { id: "runner", syncVersion: 1 },
      data: {
        syncVersion: { increment: 1 }, syncBefore: null, syncPage: 1, syncNewest: null,
        syncCursor: newest + 20, lastSyncedAt: expect.any(Date),
      },
    });
  } finally {
    clock.mockRestore();
  }
});

it("discards a stale request if another worker already claimed the page", async () => {
  mocks.fetch.mockResolvedValue([run]);
  mocks.updateUser.mockResolvedValue({ count: 0 });
  mocks.findUser.mockResolvedValueOnce(state).mockResolvedValueOnce({ syncBefore: newest });
  await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: true });
  expect(mocks.findRuns).not.toHaveBeenCalled();
});

it("updates but does not count a run replayed at a cursor boundary", async () => {
  const stravaId = 9007199254740993n;
  mocks.findUser.mockResolvedValue({ ...state, syncCursor: newest });
  mocks.fetch.mockResolvedValue([run]);
  mocks.findRuns.mockResolvedValue([{ stravaId }]);
  await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: false });
  expect(mocks.findRuns).toHaveBeenCalledWith({
    where: { userId: "runner", stravaId: { in: [stravaId] } },
    select: { stravaId: true },
  });
  expect(mocks.updateRun).toHaveBeenCalledWith({
    where: { userId_stravaId: { userId: "runner", stravaId } },
    data: expect.objectContaining({ name: run.name }),
  });
  expect(mocks.createRuns).not.toHaveBeenCalled();
});

it("leaves paging untouched after an upstream failure", async () => {
  mocks.fetch.mockRejectedValue(new Error("network"));
  await expect(syncRuns("runner")).rejects.toThrow("network");
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
