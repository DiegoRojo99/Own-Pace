import { describe, expect, it } from "vitest";
import { calculateSplitMilestones, calculateStravaMilestones } from "./milestone-calculation";

describe("Strava best-effort milestones", () => {
  it("uses Strava's own time and does not invent a 2 km record", () => {
    expect(calculateStravaMilestones([
      { distance: 400, moving_time: 87, elapsed_time: 87 },
      { distance: 1000, moving_time: 465, elapsed_time: 465 },
      { distance: 1609, moving_time: 877, elapsed_time: 877 },
    ])).toEqual([{ distanceKey: "1km", duration: 465, timeBasis: "MOVING" }]);
  });

  it("falls back to elapsed time and accepts rounded official distances", () => {
    expect(calculateStravaMilestones([
      { distance: 5000, moving_time: 0, elapsed_time: 1800 },
      { distance: 8047, moving_time: 2700 },
      { distance: 21097, moving_time: 6000 },
    ])).toEqual([
      { distanceKey: "5km", duration: 1800, timeBasis: "ELAPSED" },
      { distanceKey: "5mi", duration: 2700, timeBasis: "MOVING" },
      { distanceKey: "half-marathon", duration: 6000, timeBasis: "MOVING" },
    ]);
  });

  it("ignores efforts without usable time and rejects malformed data", () => {
    expect(calculateStravaMilestones([{ distance: 1000, moving_time: 0 }])).toEqual([]);
    expect(() => calculateStravaMilestones([{ distance: NaN }])).toThrow();
    expect(() => calculateStravaMilestones([{ distance: 1000, moving_time: -1 }])).toThrow();
  });
});

describe("complete-split milestone fallback", () => {
  it("finds the fastest exact consecutive split window and uses elapsed time when needed", () => {
    const records = calculateSplitMilestones([
      { index: 1, distance: 1000, movingTime: 280, elapsedTime: 300 },
      { index: 2, distance: 1000, movingTime: 0, elapsedTime: 310 },
      { index: 3, distance: 1000, movingTime: 240, elapsedTime: 260 },
    ]);
    expect(records.find((record) => record.distanceKey === "1km")).toEqual({
      distanceKey: "1km", duration: 240, timeBasis: "MOVING",
    });
    expect(records.find((record) => record.distanceKey === "2km")).toEqual({
      distanceKey: "2km", duration: 570, timeBasis: "ELAPSED",
    });
    expect(records.some((record) => record.distanceKey === "5mi")).toBe(false);
  });

  it("does not combine nonconsecutive splits or estimate partial splits", () => {
    const records = calculateSplitMilestones([
      { index: 1, distance: 1000, movingTime: 300, elapsedTime: 300 },
      { index: 3, distance: 1000, movingTime: 300, elapsedTime: 300 },
      { index: 4, distance: 800, movingTime: 240, elapsedTime: 240 },
    ]);
    expect(records.map((record) => record.distanceKey)).toEqual(["1km"]);
  });

  it("uses moving time without elapsed time, but does not combine incomplete timing", () => {
    const records = calculateSplitMilestones([
      { index: 1, distance: 1000, movingTime: 300, elapsedTime: 0 },
      { index: 2, distance: 1000, movingTime: 0, elapsedTime: 330 },
    ]);
    expect(records).toEqual([
      { distanceKey: "1km", duration: 300, timeBasis: "MOVING" },
    ]);
  });
});
