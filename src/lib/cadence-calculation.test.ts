import { expect, it } from "vitest";
import { calculateCadenceDurations } from "./cadence-calculation";

function streams(time: number[], cadence: number[], moving = time.map(() => true)) {
  return { time: { data: time }, cadence: { data: cadence }, moving: { data: moving } };
}

it("preserves exact threshold totals while bridging brief dips and ignoring walking at the edges", () => {
  expect(calculateCadenceDurations(streams(
    [0, 20, 50, 90, 100, 160, 180],
    [60, 67.5, 80, 67, 75, 50, 90],
  ))).toEqual({ runningTime: 130, walkingTime: 50, firstRunningTime: 130, lastRunningTime: 130, source: "CADENCE" });
});

it("excludes stopped intervals and breaks running bouts at pauses", () => {
  expect(calculateCadenceDurations(streams(
    [0, 10, 40, 60, 100], [80, 80, 80, 80, 80], [true, false, true, true, true],
  ))).toEqual({ runningTime: 70, walkingTime: 0, firstRunningTime: 60, lastRunningTime: 60, source: "CADENCE" });
});

it("uses the same first and last duration when there is only one running bout", () => {
  expect(calculateCadenceDurations(streams([0, 20, 60, 80], [40, 80, 40, 40])))
    .toEqual({ runningTime: 40, walkingTime: 40, firstRunningTime: 40, lastRunningTime: 40, source: "CADENCE" });
});

it("reports zero bouts for a walking-only run, including moving zero cadence", () => {
  expect(calculateCadenceDurations(streams([0, 10, 30], [0, 60, 0])))
    .toEqual({ runningTime: 0, walkingTime: 30, firstRunningTime: 0, lastRunningTime: 0, source: "CADENCE" });
});

it("reports missing or insufficient streams as unavailable, not walking", () => {
  expect(calculateCadenceDurations({})).toBeNull();
  expect(calculateCadenceDurations({ time: { data: [0, 10] }, moving: { data: [true, true] } })).toBeNull();
  expect(calculateCadenceDurations(streams([0], [80]))).toBeNull();
});

it.each([
  null,
  [],
  { ...streams([0, 10], [80, 80]), cadence: { data: "bad" } },
  streams([0, 10], [80]),
  streams([0, 0], [80, 80]),
  streams([10, 0], [80, 80]),
  streams([0, NaN], [80, 80]),
  streams([0, 10], [80, -1]),
  streams([0, 10], [80, Infinity]),
  { ...streams([0, 10], [80, 80]), moving: { data: [true, 1] } },
])("rejects malformed stream data (%j)", (payload) => {
  expect(() => calculateCadenceDurations(payload)).toThrow();
});

it.each([15, 16])("bridges at most 15 elapsed seconds (%i), excluding both walking and stopped gaps from bout duration", (gap) => {
  for (const isMoving of [true, false]) {
    expect(calculateCadenceDurations(streams(
      [0, 40, 40 + gap, 100 + gap], [80, 50, 80, 80], [true, isMoving, true, true],
    ))).toEqual({
      runningTime: 100, walkingTime: isMoving ? gap : 0,
      firstRunningTime: gap === 15 ? 100 : 40,
      lastRunningTime: gap === 15 ? 100 : 60, source: "CADENCE",
    });
  }
});

it("ignores short running blips at both ends and requires 30 running seconds, not elapsed bout time", () => {
  expect(calculateCadenceDurations(streams(
    [0, 10, 30, 70, 90, 110], [80, 40, 80, 40, 80, 80],
  ))).toEqual({ runningTime: 70, walkingTime: 40, firstRunningTime: 40, lastRunningTime: 40, source: "CADENCE" });
  expect(calculateCadenceDurations(streams(
    [0, 14, 29, 44], [80, 40, 80, 80],
  ))).toMatchObject({ runningTime: 29, walkingTime: 15, firstRunningTime: 0, lastRunningTime: 0 });
  expect(calculateCadenceDurations(streams([0, 30], [80, 80])))
    .toMatchObject({ firstRunningTime: 30, lastRunningTime: 30 });
});

it("uses speed at 9:00/km when cadence is absent, respecting moving flags", () => {
  expect(calculateCadenceDurations({
    time: { data: [0, 30, 60, 90, 100] },
    moving: { data: [true, true, true, false, false] },
    velocity_smooth: { data: [1000 / 540, 1.8, 2.5, 3, 0] },
  })).toEqual({ runningTime: 60, walkingTime: 30, firstRunningTime: 30, lastRunningTime: 30, source: "SPEED" });
});

it("derives speed from distance and elapsed time if Strava provides no speed or cadence", () => {
  expect(calculateCadenceDurations({
    time: { data: [0, 30, 90] }, moving: { data: [true, true, true] }, distance: { data: [0, 60, 120] },
  })).toEqual({ runningTime: 30, walkingTime: 60, firstRunningTime: 30, lastRunningTime: 30, source: "SPEED" });
});

it("prefers cadence over speed and speed over noisy distance increments", () => {
  expect(calculateCadenceDurations({
    ...streams([0, 30], [60, 60]), velocity_smooth: { data: [4, 4] },
  })).toMatchObject({ runningTime: 0, walkingTime: 30, source: "CADENCE" });
  expect(calculateCadenceDurations({
    time: { data: [0, 30] }, moving: { data: [true, true] },
    velocity_smooth: { data: [2, 2] }, distance: { data: [0, 0] },
  })).toMatchObject({ runningTime: 30, walkingTime: 0, source: "SPEED" });
});

it.each([
  { velocity_smooth: { data: [2] } },
  { velocity_smooth: { data: [2, NaN] } },
  { distance: { data: [2, 1] } },
])("rejects malformed fallback streams instead of inventing walking data (%j)", (fallback) => {
  expect(() => calculateCadenceDurations({
    time: { data: [0, 30] }, moving: { data: [true, true] }, ...fallback,
  })).toThrow();
});
