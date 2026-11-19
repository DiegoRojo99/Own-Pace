import { beforeEach, expect, it, vi } from "vitest";
import { fetchRunDetails, getRun, getRuns } from "./runs";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findRun: vi.fn(),
  updateRun: vi.fn(),
  createSplits: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./strava", async (importOriginal) => ({
  ...await importOriginal<typeof import("./strava")>(),
  stravaFetch: mocks.fetch,
}));

vi.mock("./db", () => {
  const tx = {
    activity: { findMany: mocks.findMany, findUnique: mocks.findRun, updateMany: mocks.updateRun },
    split: { createMany: mocks.createSplits },
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

const owner = { userId: "runner", id: "local-run" };
const runTypeFilter = { in: ["Run", "TrailRun"] };
const stravaId = 9007199254740993n;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findRun.mockResolvedValue({ stravaId, detailFetched: false });
  mocks.updateRun.mockResolvedValue({ count: 1 });
});

it("scopes list, detail, and split fetch to the user's running activities", async () => {
  mocks.findRun.mockResolvedValue(null);
  await getRuns(owner.userId);
  await getRun(owner.userId, owner.id);
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toBeNull();
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: owner.userId, type: runTypeFilter } }));
  expect(mocks.findRun).toHaveBeenNthCalledWith(1, {
    where: { ...owner, type: runTypeFilter },
    include: { splits: { orderBy: { index: "asc" } } },
  });
  expect(mocks.findRun).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { ...owner, type: runTypeFilter } }));
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("claims before inserting metric splits and uses a lossless Strava ID in the path", async () => {
  mocks.fetch.mockResolvedValue({
    splits_metric: [{ split: 1, distance: 1000, moving_time: 300, elapsed_time: 310,
      elevation_difference: -8, average_speed: 3.33 }],
  });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({ route: null });
  expect(mocks.fetch).toHaveBeenCalledWith(owner.userId, "/activities/9007199254740993");
  expect(mocks.updateRun).toHaveBeenCalledWith({
    where: { ...owner, type: runTypeFilter, detailFetched: false }, data: { detailFetched: true },
  });
  expect(mocks.updateRun.mock.invocationCallOrder[0]).toBeLessThan(mocks.createSplits.mock.invocationCallOrder[0]);
  expect(mocks.createSplits).toHaveBeenCalledWith({
    data: [{ activityId: owner.id, index: 1, distance: 1000, movingTime: 300, elapsedTime: 310,
      elevationDifference: -8, averageSpeed: 3.33, averageHeartrate: null }],
  });
});

it("caches empty splits while loading the route again on a subsequent visit", async () => {
  mocks.fetch.mockResolvedValue({});
  mocks.findRun.mockResolvedValueOnce({ stravaId, detailFetched: false })
    .mockResolvedValueOnce({ stravaId, detailFetched: true });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({ route: null });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({ route: null });
  expect(mocks.updateRun).toHaveBeenCalledOnce();
  expect(mocks.createSplits).not.toHaveBeenCalled();
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it("does not insert when the claim loses to another worker", async () => {
  mocks.fetch.mockResolvedValue({ splits_metric: [] });
  mocks.updateRun.mockResolvedValue({ count: 0 });
  mocks.findRun.mockResolvedValueOnce({ stravaId, detailFetched: false })
    .mockResolvedValueOnce({ id: owner.id });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({ route: null });
  expect(mocks.createSplits).not.toHaveBeenCalled();
});

it("loads the route for a run whose splits are already cached", async () => {
  mocks.findRun.mockResolvedValue({ stravaId, detailFetched: true });
  mocks.fetch.mockResolvedValue({ map: { polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" } });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({
    route: [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]],
  });
  expect(mocks.updateRun).not.toHaveBeenCalled();
});

it("uses the summary route when the detailed polyline is absent", async () => {
  mocks.fetch.mockResolvedValue({ map: { polyline: null, summary_polyline: "_p~iF~ps|U_ulLnnqC" } });
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toEqual({
    route: [[38.5, -120.2], [40.7, -120.95]],
  });
});

it("reports malformed route data instead of caching incomplete details", async () => {
  mocks.fetch.mockResolvedValue({ map: { polyline: "_" } });
  await expect(fetchRunDetails(owner.userId, owner.id)).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.updateRun).not.toHaveBeenCalled();
});

it("returns not found if the run is deleted while its details are loading", async () => {
  mocks.fetch.mockResolvedValue({ map: { polyline: "_p~iF~ps|U_ulLnnqC" } });
  mocks.updateRun.mockResolvedValue({ count: 0 });
  mocks.findRun.mockResolvedValueOnce({ stravaId, detailFetched: false }).mockResolvedValueOnce(null);
  await expect(fetchRunDetails(owner.userId, owner.id)).resolves.toBeNull();
});
