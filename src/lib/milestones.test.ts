import { beforeEach, expect, it, vi } from "vitest";
import { calculateMilestoneBatch, getMilestones, retryUnavailableMilestones } from "./milestones";
import { StravaError } from "./strava";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findRuns: vi.fn(),
  updateRuns: vi.fn(),
  countRuns: vi.fn(),
  createEfforts: vi.fn(),
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
    milestoneEffort: { createMany: mocks.createEfforts, findMany: mocks.findEfforts },
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findRuns.mockResolvedValue([{ id: "run", stravaId: 9007199254740993n }]);
  mocks.updateRuns.mockResolvedValue({ count: 1 });
  mocks.countRuns.mockResolvedValue(0);
});

it("fetches each owner's samples and atomically stores calculated efforts", async () => {
  mocks.fetch.mockResolvedValue({ distance: { data: [0, 1000] }, time: { data: [0, 300] } });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 1, remaining: 0 });
  expect(mocks.findRuns).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: "runner", milestoneChecked: false }, take: 5,
  }));
  expect(mocks.fetch).toHaveBeenCalledWith("runner", "/activities/9007199254740993/streams", {
    keys: "distance,time", key_by_type: true,
  });
  expect(mocks.updateRuns).toHaveBeenCalledWith({
    where: { id: "run", userId: "runner", milestoneChecked: false },
    data: { milestoneChecked: true, milestoneUnavailable: false },
  });
  expect(mocks.createEfforts).toHaveBeenCalledWith({
    data: [{ activityId: "run", distanceKey: "1km", elapsedTime: 300 }],
  });
});

it("marks missing samples and inaccessible runs as unavailable", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "first", stravaId: 1n }, { id: "second", stravaId: 2n }, { id: "third", stravaId: 3n }]);
  mocks.fetch.mockResolvedValueOnce({}).mockResolvedValueOnce([]).mockRejectedValueOnce(new StravaError("not-found"));
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 3, remaining: 0 });
  expect(mocks.updateRuns).toHaveBeenCalledTimes(3);
  expect(mocks.updateRuns).toHaveBeenCalledWith(expect.objectContaining({
    data: { milestoneChecked: true, milestoneUnavailable: true },
  }));
  expect(mocks.createEfforts).not.toHaveBeenCalled();
});

it("does not save duplicate efforts when another request claims the run", async () => {
  mocks.fetch.mockResolvedValue({ distance: { data: [0, 1000] }, time: { data: [0, 300] } });
  mocks.updateRuns.mockResolvedValue({ count: 0 });
  await expect(calculateMilestoneBatch("runner")).resolves.toEqual({ checked: 0, remaining: 0 });
  expect(mocks.createEfforts).not.toHaveBeenCalled();
});

it("reports invalid streams or rate limits without marking the run checked", async () => {
  mocks.fetch.mockResolvedValueOnce({ distance: { data: [0, 1000] }, time: { data: [0] } })
    .mockRejectedValueOnce(new StravaError("rate-limit"));
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "upstream" });
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.updateRuns).not.toHaveBeenCalled();
});

it("selects best efforts scoped to the current user and exposes empty records", async () => {
  const activity = { id: "run", name: "Run", startDate: new Date("2026-01-01") };
  mocks.findEfforts.mockResolvedValue([
    { distanceKey: "1km", elapsedTime: 250, activity },
    { distanceKey: "1km", elapsedTime: 300, activity },
  ]);
  mocks.countRuns.mockResolvedValueOnce(2).mockResolvedValueOnce(1).mockResolvedValueOnce(10);
  const result = await getMilestones("runner");
  expect(mocks.findEfforts).toHaveBeenCalledWith(expect.objectContaining({ where: { activity: { userId: "runner" } } }));
  expect(result.pending).toBe(2);
  expect(result.unavailable).toBe(1);
  expect(result.total).toBe(10);
  expect(result.records).toHaveLength(7);
  expect(result.records[0].effort?.elapsedTime).toBe(250);
  expect(result.records[1].effort).toBeNull();
});

it("keeps earlier results when a later run hits the rate limit", async () => {
  mocks.findRuns.mockResolvedValue([{ id: "first", stravaId: 1n }, { id: "second", stravaId: 2n }]);
  mocks.fetch.mockResolvedValueOnce({ distance: { data: [0, 1000] }, time: { data: [0, 300] } })
    .mockRejectedValueOnce(new StravaError("rate-limit"));
  await expect(calculateMilestoneBatch("runner")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.updateRuns).toHaveBeenCalledTimes(1);
  expect(mocks.createEfforts).toHaveBeenCalledOnce();
});

it("retries unavailable runs only for the current user", async () => {
  await retryUnavailableMilestones("runner");
  expect(mocks.updateRuns).toHaveBeenCalledWith({
    where: { userId: "runner", milestoneChecked: true, milestoneUnavailable: true },
    data: { milestoneChecked: false, milestoneUnavailable: false },
  });
});
