import { beforeEach, expect, it, vi } from "vitest";
import { calculateCadenceBatch, retryUnavailableCadence } from "./cadence";
import { StravaError } from "./strava";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn(), fetch: vi.fn(),
}));
vi.mock("./db", () => ({
  db: { activity: { findMany: mocks.findMany, updateMany: mocks.updateMany, count: mocks.count } },
}));
vi.mock("./strava", async (importOriginal) => ({
  ...await importOriginal<typeof import("./strava")>(), stravaFetch: mocks.fetch,
}));
const filter = {
  userId: "runner", type: { in: ["Run", "TrailRun"] },
  OR: [{ cadenceChecked: false }, { cadenceVersion: { lt: 1 } }],
};
const streams = {
  time: { data: [0, 30, 50] }, cadence: { data: [80, 60, 60] }, moving: { data: [true, true, true] },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([{ id: "local", stravaId: 9007199254740993n }]);
  mocks.fetch.mockResolvedValue(streams);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.count.mockResolvedValue(4);
});

it("loads bounded owner-scoped batches and atomically saves duration summaries", async () => {
  await expect(calculateCadenceBatch("runner")).resolves.toEqual({ checked: 1, remaining: 4 });
  expect(mocks.findMany).toHaveBeenCalledWith({
    where: filter, select: { id: true, stravaId: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }], take: 5,
  });
  expect(mocks.fetch).toHaveBeenCalledWith("runner", "/activities/9007199254740993/streams", {
    keys: "time,cadence,moving,velocity_smooth,distance", key_by_type: true, resolution: "high",
  });
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { id: "local", ...filter },
    data: { cadenceChecked: true, cadenceVersion: 1, cadenceSource: "CADENCE",
      runningTime: 30, walkingTime: 20, firstRunningTime: 30, lastRunningTime: 30 },
  });
  expect(mocks.count).toHaveBeenCalledWith({ where: filter });
});

it.each([{}, new StravaError("not-found")])("caches unavailable streams separately from zero durations", async (response) => {
  if (response instanceof Error) mocks.fetch.mockRejectedValue(response);
  else mocks.fetch.mockResolvedValue(response);
  await calculateCadenceBatch("runner");
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { cadenceChecked: true, cadenceVersion: 1, cadenceSource: null,
      runningTime: null, walkingTime: null, firstRunningTime: null, lastRunningTime: null },
  }));
});

it("saves the speed-estimate source for runs without cadence", async () => {
  mocks.fetch.mockResolvedValue({
    time: streams.time, moving: streams.moving, velocity_smooth: { data: [2, 1, 0] },
  });
  await calculateCadenceBatch("runner");
  expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ cadenceSource: "SPEED", cadenceVersion: 1, runningTime: 30, walkingTime: 20 }),
  }));
});

it.each([new StravaError("rate-limit"), new StravaError("revoked"), new StravaError("upstream")])(
  "leaves failed requests pending (%s)", async (error) => {
    mocks.fetch.mockRejectedValue(error);
    await expect(calculateCadenceBatch("runner")).rejects.toBe(error);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  },
);

it("does not cache malformed streams as unavailable", async () => {
  mocks.fetch.mockResolvedValue({ ...streams, cadence: { data: [-1, 80, 80] } });
  await expect(calculateCadenceBatch("runner")).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.updateMany).not.toHaveBeenCalled();
});

it("keeps saved progress if a later request fails", async () => {
  mocks.findMany.mockResolvedValue([{ id: "one", stravaId: 1n }, { id: "two", stravaId: 2n }]);
  mocks.fetch.mockResolvedValueOnce(streams).mockRejectedValueOnce(new StravaError("rate-limit"));
  await expect(calculateCadenceBatch("runner")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.updateMany).toHaveBeenCalledOnce();
});

it("does not count a run already claimed or deleted", async () => {
  mocks.updateMany.mockResolvedValue({ count: 0 });
  await expect(calculateCadenceBatch("runner")).resolves.toEqual({ checked: 0, remaining: 4 });
});

it("only retries the owner's runs with unavailable cadence", async () => {
  await retryUnavailableCadence("runner");
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { userId: "runner", type: { in: ["Run", "TrailRun"] }, cadenceChecked: true, runningTime: null },
    data: { cadenceChecked: false },
  });
});
