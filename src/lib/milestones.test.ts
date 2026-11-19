import { beforeEach, expect, it, vi } from "vitest";
import { calculateMilestoneBatch, getMilestones, retryUnavailableMilestones } from "./milestones";
import { StravaError } from "./strava";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findRuns: vi.fn(),
  updateRuns: vi.fn(),
  countRuns: vi.fn(),
  createEfforts: vi.fn(),
  deleteEfforts: vi.fn(),
  findEfforts: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./strava", async (importOriginal) => ({
  ...await importOriginal<typeof import("./strava")>(),
  stravaFetch: mocks.fetch,
}));

vi.mock("./db", () => {
  const tx = {
    activity: { findMany: mocks.findRuns, updateMany: mocks.updateRuns, count: mocks.countRuns },
    milestoneEffort: { createMany: mocks.createEfforts, deleteMany: mocks.deleteEfforts, findMany: mocks.findEfforts },
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 9007199254740993n, distance: 1000, splits: [] }]);
  mocks.updateRuns.mockResolvedValue({ count: 1 });
  mocks.countRuns.mockResolvedValue(0);
});

it("stores Strava's own best effort, without fetching or interpolating streams", async () => {
  mocks.fetch.mockResolvedValue({ best_efforts: [{ distance: 1000, moving_time: 465, elapsed_time: 465 }] });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.findRuns).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: "runner", type: { in: ["Run", "TrailRun"] }, milestoneChecked: false }, take: 5,
  }));
  expect(mocks.fetch).toHaveBeenCalledWith("runner", "/activities/9007199254740993");
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: [{ activityId: "run", distanceKey: "1km", duration: 465, timeBasis: "MOVING", source: "STRAVA" }],
  });
  expect(mocks.deleteEfforts).toHaveBeenCalledWith({ where: { activityId: "run" } });
  expect(mocks.deleteEfforts.mock.invocationCallOrder[0]).toBeLessThan(mocks.createEfforts.mock.invocationCallOrder[0]);
});

it("prefers Strava's effort and uses exact complete splits for other distances", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 1n, distance: 2000, splits: [] }]);
  mocks.fetch.mockResolvedValue({
    best_efforts: [{ distance: 1000, moving_time: 350 }],
    splits_metric: [
      { split: 1, distance: 1000, moving_time: 250, elapsed_time: 270 },
      { split: 2, distance: 1000, moving_time: 0, elapsed_time: 310 },
    ],
  });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: [
      { activityId: "run", distanceKey: "1km", duration: 350, timeBasis: "MOVING", source: "STRAVA" },
      { activityId: "run", distanceKey: "2km", duration: 580, timeBasis: "ELAPSED", source: "SPLITS" },
    ],
  });
  expect(mocks.updateRuns).toHaveBeenCalledWith(expect.objectContaining({
    data: { milestoneChecked: true, milestoneUnavailable: false },
  }));
});

it("stores 2 km and 3 km split records when measured split distances slightly exceed them", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 1n, distance: 3003.2, splits: [] }]);
  mocks.fetch.mockResolvedValue({
    splits_metric: [
      { split: 1, distance: 1000.1, moving_time: 402, elapsed_time: 420 },
      { split: 2, distance: 1000, moving_time: 402, elapsed_time: 402 },
      { split: 3, distance: 1003.1, moving_time: 608, elapsed_time: 749 },
    ],
  });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      { activityId: "run", distanceKey: "2km", duration: 804, timeBasis: "MOVING", source: "SPLITS" },
      { activityId: "run", distanceKey: "3km", duration: 1412, timeBasis: "MOVING", source: "SPLITS" },
    ]),
  });
});

it("reports missing distances instead of estimating from partial splits", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 1n, distance: 8000, splits: [] }]);
  mocks.fetch.mockResolvedValue({ best_efforts: [{ distance: 1000, moving_time: 300 }] });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: [{ activityId: "run", distanceKey: "1km", duration: 300, timeBasis: "MOVING", source: "STRAVA" }],
  });
  expect(mocks.updateRuns).toHaveBeenCalledWith(expect.objectContaining({
    data: { milestoneChecked: true, milestoneUnavailable: true },
  }));
});

it("uses cached complete splits when the activity is unavailable on Strava", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 1n, distance: 1000, splits: [
    { index: 1, distance: 1000, movingTime: 0, elapsedTime: 310 },
  ] }]);
  mocks.fetch.mockRejectedValue(new StravaError("not-found"));
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: [{ activityId: "run", distanceKey: "1km", duration: 310, timeBasis: "ELAPSED", source: "SPLITS" }],
  });
  expect(mocks.updateRuns).toHaveBeenCalledWith(expect.objectContaining({
    data: { milestoneChecked: true, milestoneUnavailable: true },
  }));
});

it("does not replace efforts when another request claims the run", async () => {
  mocks.fetch.mockResolvedValue({ best_efforts: [{ distance: 1000, moving_time: 300 }] });
  mocks.updateRuns.mockResolvedValue({ count: 0 });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 0, remaining: 0 });
  expect(mocks.deleteEfforts).not.toHaveBeenCalled();
  expect(mocks.createEfforts).not.toHaveBeenCalled();
});

it("reports malformed details and rate limits without marking the run checked", async () => {
  mocks.fetch.mockResolvedValueOnce({ best_efforts: "invalid" })
    .mockRejectedValueOnce(new StravaError("rate-limit"));
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "upstream" });
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.updateRuns).not.toHaveBeenCalled();
});

it("loads efforts and counts scoped to the current user", async () => {
  const activity = { id: "run", name: "Run", startDate: new Date("2026-01-01") };
  mocks.findEfforts.mockResolvedValue([
    { distanceKey: "1km", duration: 250, timeBasis: "MOVING", source: "STRAVA", activity },
    { distanceKey: "1km", duration: 300, timeBasis: "ELAPSED", source: "SPLITS", activity },
  ]);
  mocks.countRuns.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(10);
  const result = await getMilestones("runner");
  expect(mocks.findEfforts).toHaveBeenCalledWith(expect.objectContaining({
    where: { activity: { userId: "runner", type: { in: ["Run", "TrailRun"] } } },
    orderBy: [{ duration: "asc" }, { activity: { startDate: "desc" } }, { activityId: "asc" }],
  }));
  expect(mocks.countRuns).toHaveBeenLastCalledWith({ where: { userId: "runner", type: { in: ["Run", "TrailRun"] } } });
  expect(result).toMatchObject({ pending: 2, unavailable: 1, total: 10 });
  expect(result.efforts[0].duration).toBe(250);
});

it("keeps earlier results when a later run hits the rate limit", async () => {
  mocks.findRuns.mockResolvedValue([
    { id: "first", stravaId: 1n, distance: 1000, splits: [] },
    { id: "second", stravaId: 2n, distance: 1000, splits: [] },
  ]);
  mocks.fetch.mockResolvedValueOnce({ best_efforts: [{ distance: 1000, moving_time: 300 }] })
    .mockRejectedValueOnce(new StravaError("rate-limit"));
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.updateRuns).toHaveBeenCalledTimes(1);
  expect(mocks.createEfforts).toHaveBeenCalledOnce();
});

it("retries unavailable runs only for the current user", async () => {
  await retryUnavailableMilestones("runner");
  expect(mocks.updateRuns).toHaveBeenCalledWith({
    where: { userId: "runner", type: { in: ["Run", "TrailRun"] }, milestoneChecked: true, milestoneUnavailable: true },
    data: { milestoneChecked: false, milestoneUnavailable: false },
  });
});
