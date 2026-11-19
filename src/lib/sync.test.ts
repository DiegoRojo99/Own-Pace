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
const state = {
  syncCursor: null,
  syncBefore: null,
  syncPage: 1,
  syncNewest: null,
  activityRefreshBefore: null,
  activityRefreshPage: 1,
  syncVersion: 0,
};
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
    const ride = { id: "123", name: "Easy ride", start_date: new Date((newest + 20) * 1000).toISOString(), type: "Ride" };
    const virtual = { ...run, type: "Run", sport_type: "VirtualRun" };
    mocks.fetch.mockResolvedValueOnce([run, virtual, ...Array.from({ length: 98 }, () => ride)]).mockResolvedValueOnce([]);
    await expect(syncRuns("runner")).resolves.toEqual({ count: 1, more: true, refreshed: 0, refreshMore: false });
    expect(mocks.fetch).toHaveBeenNthCalledWith(1, "runner", "/athlete/activities",
      { before, after: existingCursor - 1, page: 1, per_page: 100 });
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, "runner", "/athlete/activities",
      { before, page: 1, per_page: 100 });
    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, {
      where: { id: "runner", syncVersion: 0 },
      data: {
        syncVersion: { increment: 1 }, syncBefore: before, syncPage: 2, syncNewest: newest + 20,
        activityRefreshBefore: null, activityRefreshPage: 1,
      },
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
    mocks.fetch.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: false, refreshed: 0, refreshMore: false });
    expect(mocks.fetch).toHaveBeenNthCalledWith(3, "runner", "/athlete/activities",
      expect.objectContaining({ before, after: existingCursor - 1, page: 2 }));
    expect(mocks.fetch).toHaveBeenNthCalledWith(4, "runner", "/athlete/activities",
      { before: before + 3600, page: 1, per_page: 100 });
    expect(mocks.updateUser).toHaveBeenNthCalledWith(2, {
      where: { id: "runner", syncVersion: 1 },
      data: {
        syncVersion: { increment: 1 }, syncBefore: null, syncPage: 1, syncNewest: null,
        syncCursor: newest + 20, lastSyncedAt: expect.any(Date),
        activityRefreshBefore: null, activityRefreshPage: 1,
      },
    });
  } finally {
    clock.mockRestore();
  }
});

it("discards a stale request if another worker already claimed the page", async () => {
  mocks.fetch.mockResolvedValue([run]);
  mocks.updateUser.mockResolvedValue({ count: 0 });
  mocks.findUser.mockResolvedValueOnce(state).mockResolvedValueOnce({ syncBefore: newest, activityRefreshBefore: null });
  await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: true, refreshed: 0, refreshMore: false });
  expect(mocks.findRuns).not.toHaveBeenCalled();
});

it("updates but does not count a run replayed at a cursor boundary", async () => {
  const stravaId = 9007199254740993n;
  mocks.findUser.mockResolvedValue({ ...state, syncCursor: newest });
  mocks.fetch.mockResolvedValue([run]);
  mocks.findRuns.mockResolvedValue([{ stravaId, name: run.name }]);
  await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: false, refreshed: 0, refreshMore: false });
  expect(mocks.findRuns).toHaveBeenCalledWith({
    where: { userId: "runner", stravaId: { in: [stravaId] } },
    select: { stravaId: true, name: true },
  });
  expect(mocks.updateRun).toHaveBeenCalledWith({
    where: { userId_stravaId: { userId: "runner", stravaId } },
    data: expect.objectContaining({ name: run.name }),
  });
  expect(mocks.createRuns).not.toHaveBeenCalled();
});

it("updates an older imported run name from the rotating activity page", async () => {
  const refreshBefore = newest + 500;
  const stravaId = 9007199254740993n;
  mocks.findUser.mockResolvedValue({
    ...state,
    syncCursor: newest,
    activityRefreshBefore: refreshBefore,
    activityRefreshPage: 3,
  });
  mocks.fetch.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...run, name: "Renamed in Strava" }]);
  mocks.findRuns.mockResolvedValueOnce([{ stravaId, name: "Old name" }]);

  await expect(syncRuns("runner")).resolves.toEqual({ count: 0, more: false, refreshed: 1, refreshMore: false });
  expect(mocks.fetch).toHaveBeenNthCalledWith(2, "runner", "/athlete/activities", {
    before: refreshBefore,
    page: 3,
    per_page: 100,
  });
  expect(mocks.updateRun).toHaveBeenCalledWith({
    where: { userId_stravaId: { userId: "runner", stravaId } },
    data: { name: "Renamed in Strava" },
  });
  expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ activityRefreshBefore: null, activityRefreshPage: 1 }),
  }));
});

it("advances the older-activity page cursor when a full page remains", async () => {
  const refreshBefore = newest + 500;
  const page = Array.from({ length: 100 }, (_, index) => ({ ...run, id: String(BigInt(run.id) + BigInt(index)) }));
  mocks.findUser.mockResolvedValue({
    ...state,
    syncCursor: newest,
    activityRefreshBefore: refreshBefore,
    activityRefreshPage: 3,
  });
  mocks.fetch.mockResolvedValueOnce([]).mockResolvedValueOnce(page);
  mocks.findRuns.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

  await expect(syncRuns("runner")).resolves.toMatchObject({ more: false, refreshMore: true });
  expect(mocks.updateUser).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ activityRefreshBefore: refreshBefore, activityRefreshPage: 4 }),
  }));
});

it("leaves paging untouched after an upstream failure", async () => {
  mocks.fetch.mockRejectedValue(new Error("network"));
  await expect(syncRuns("runner")).rejects.toThrow("network");
  expect(mocks.updateUser).not.toHaveBeenCalled();
});
