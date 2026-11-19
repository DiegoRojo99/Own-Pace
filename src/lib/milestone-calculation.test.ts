import { describe, expect, it } from "vitest";
import { calculateMilestones } from "./milestone-calculation";

describe("milestone calculation", () => {
  it("finds the fastest continuous segment, interpolating between samples", () => {
    const records = calculateMilestones([0, 500, 1300, 1800], [0, 100, 200, 400]);
    expect(records).toEqual([{ distanceKey: "1km", elapsedTime: 140 }]);
  });

  it("includes pauses inside an effort but can start after a pause", () => {
    expect(calculateMilestones([0, 500, 500, 1000], [0, 50, 80, 130]))
      .toEqual([{ distanceKey: "1km", elapsedTime: 130 }]);
    expect(calculateMilestones([0, 500, 500, 1000, 1500], [0, 50, 80, 130, 180]))
      .toEqual([{ distanceKey: "1km", elapsedTime: 100 }]);
  });

  it("uses the exact distance for five miles and leaves longer milestones empty", () => {
    const records = calculateMilestones([0, 8046.72], [0, 1600]);
    expect(records.map((record) => record.distanceKey)).toEqual(["1km", "2km", "5km", "5mi"]);
    expect(records.find((record) => record.distanceKey === "5mi")?.elapsedTime).toBe(1600);
  });

  it("recognizes exact half-marathon and marathon distances", () => {
    const records = calculateMilestones([0, 42195], [0, 16878]);
    expect(records.find((record) => record.distanceKey === "half-marathon")?.elapsedTime).toBeCloseTo(8439);
    expect(records.find((record) => record.distanceKey === "marathon")?.elapsedTime).toBe(16878);
  });

  it("rejects malformed or decreasing streams and ignores insufficient samples", () => {
    expect(calculateMilestones([], [])).toEqual([]);
    expect(calculateMilestones([0, 500], [0, 100])).toEqual([]);
    expect(() => calculateMilestones([0, 1000], [0])).toThrow();
    expect(() => calculateMilestones([0, 1000, 900], [0, 100, 200])).toThrow();
    expect(() => calculateMilestones([0, 1000], [1, 0])).toThrow();
    expect(() => calculateMilestones([0, NaN], [0, 100])).toThrow();
  });
});
