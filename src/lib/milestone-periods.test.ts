import { describe, expect, it } from "vitest";
import { milestoneRecords, type MilestoneEffort } from "./milestone-periods";

function effort(duration: number, startDate: Date, distanceKey = "1km"): MilestoneEffort {
  return { distanceKey, duration, timeBasis: "MOVING", source: "STRAVA", activity: { id: String(duration), name: "Run", startDate } };
}

function periodTimes(efforts: MilestoneEffort[], now: Date | null) {
  return milestoneRecords(efforts, now)[0].periods.map((period) => period.effort?.duration ?? null);
}

describe("milestone periods", () => {
  it("finds separate best efforts for each rolling period and YTD", () => {
    const now = new Date("2026-07-01T12:00:00Z");
    const efforts = [
      effort(180, new Date("2024-01-01T00:00:00Z")),
      effort(200, new Date("2025-12-01T00:00:00Z")),
      effort(210, new Date("2026-01-02T00:00:00Z")),
      effort(250, new Date("2026-06-01T00:00:00Z")),
    ];
    expect(periodTimes(efforts, now)).toEqual([180, 200, 250, 210]);
    expect(milestoneRecords(efforts, now)[1].periods.every((period) => period.effort === null)).toBe(true);
  });

  it("includes cutoff instants, excludes earlier and future runs, and uses UTC year boundaries", () => {
    const now = new Date("2026-04-15T12:00:00Z");
    const lastYear = new Date("2025-04-15T12:00:00Z");
    const last90Days = new Date("2026-01-15T12:00:00Z");
    const startOfYear = new Date("2026-01-01T00:00:00Z");
    const efforts = [
      effort(80, new Date(now.getTime() + 1)),
      effort(90, new Date(lastYear.getTime() - 1)),
      effort(100, lastYear),
      effort(105, new Date(startOfYear.getTime() - 1)),
      effort(110, new Date(startOfYear)),
      effort(115, new Date(last90Days.getTime() - 1)),
      effort(120, last90Days),
    ];
    expect(periodTimes(efforts, now)).toEqual([80, 100, 120, 110]);
  });

  it("clamps the 12-month cutoff to February 28 when today is February 29", () => {
    const now = new Date("2024-02-29T12:00:00Z");
    const efforts = [
      effort(100, new Date("2023-02-28T11:59:59Z")),
      effort(110, new Date("2023-02-28T12:00:00Z")),
    ];
    expect(periodTimes(efforts, now)).toEqual([100, 110, null, null]);
  });

  it("keeps all-time results visible while dated periods are loading", () => {
    const records = milestoneRecords([effort(200, new Date("2026-01-01T00:00:00Z"))], null);
    expect(records[0].periods.map((period) => period.loading)).toEqual([false, true, true, true]);
    expect(periodTimes([effort(200, new Date("2026-01-01T00:00:00Z"))], null)).toEqual([200, null, null, null]);
  });
});
