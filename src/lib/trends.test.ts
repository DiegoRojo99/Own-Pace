import { describe, expect, it } from "vitest"

import { cadenceTrends, monthlyTrends } from "./trends"
import { CADENCE_ANALYSIS_VERSION } from "./cadence-calculation"

describe("monthly running trends", () => {
  it("returns 12 UTC calendar months and distance-weighted pace and time-weighted heart rate", () => {
    const trends = monthlyTrends([
      { startDate: new Date("2025-04-01T08:00:00Z"), distance: 4000, movingTime: 1600, averageHeartrate: 145 },
      { startDate: new Date("2026-03-01T08:00:00Z"), distance: 5000, movingTime: 1500, averageHeartrate: 150 },
      { startDate: new Date("2026-03-12T08:00:00Z"), distance: 10000, movingTime: 3600, averageHeartrate: 170 },
      { startDate: new Date("2026-03-16T08:00:00Z"), distance: 5000, movingTime: 1500, averageHeartrate: 180 },
      { startDate: new Date("2025-03-31T23:59:59Z"), distance: 2000, movingTime: 800, averageHeartrate: 140 },
    ], new Date("2026-03-15T12:00:00Z"))

    expect(trends).toHaveLength(12)
    expect(trends[0]).toMatchObject({ month: "2025-04", distance: 4000, averagePace: 400, averageHeartrate: 145 })
    expect(trends.at(-1)).toMatchObject({
      month: "2026-03",
      distance: 15000,
      runCount: 2,
      averagePace: 340,
      averageHeartrate: (150 * 1500 + 170 * 3600) / 5100,
    })
    expect(trends[1]).toMatchObject({ month: "2025-05", distance: 0, averagePace: null, averageHeartrate: null })
  })
})

it("orders cadence trends by activity time, converts seconds to minutes, and preserves missing-data gaps", () => {
  const missing = { runningTime: null, walkingTime: null, firstRunningTime: null, lastRunningTime: null, cadenceSource: null }
  const analyzed = { cadenceVersion: CADENCE_ANALYSIS_VERSION, cadenceSource: "CADENCE" as const }
  const runs = [
    { id: "later", name: "Later run", startDate: new Date("2026-02-01T12:00:00Z"), cadenceChecked: false, ...analyzed, ...missing },
    { id: "first", name: "First run", startDate: new Date("2026-01-01T12:00:00Z"), cadenceChecked: true, ...analyzed,
      runningTime: 600, walkingTime: 120, firstRunningTime: 360, lastRunningTime: 240 },
    { id: "middle", name: "No cadence", startDate: new Date("2026-01-15T12:00:00Z"), cadenceChecked: true, ...analyzed, ...missing },
    { id: "walk", name: "Walking-only run", startDate: new Date("2026-03-01T12:00:00Z"), cadenceChecked: true, ...analyzed,
      runningTime: 0, walkingTime: 120, firstRunningTime: 0, lastRunningTime: 0 },
  ]
  const trends = cadenceTrends(runs)
  expect(trends.map((point) => point.id)).toEqual(["first", "middle", "later", "walk"])
  expect(trends[0]).toMatchObject({
    name: "First run", timestamp: runs[1].startDate.getTime(), status: "available",
    runningMinutes: 10, walkingMinutes: 2, firstRunningMinutes: 6, lastRunningMinutes: 4,
  })
  expect(trends[1]).toMatchObject({ status: "unavailable", firstRunningMinutes: null, lastRunningMinutes: null })
  expect(trends[2]).toMatchObject({ status: "pending", runningMinutes: null, walkingMinutes: null })
  expect(trends[3]).toMatchObject({ status: "available", runningMinutes: 0, firstRunningMinutes: 0, lastRunningMinutes: 0 })
  expect(runs[0].id).toBe("later")
})

it("hides stale cached results until recalculated and distinguishes speed estimates", () => {
  const base = {
    name: "Run", startDate: new Date("2026-01-01T12:00:00Z"), cadenceChecked: true,
    runningTime: 120, walkingTime: 60, firstRunningTime: 60, lastRunningTime: 60,
    cadenceSource: "SPEED" as const,
  }
  const trends = cadenceTrends([
    { ...base, id: "old", cadenceVersion: CADENCE_ANALYSIS_VERSION - 1 },
    { ...base, id: "new", cadenceVersion: CADENCE_ANALYSIS_VERSION },
  ])
  expect(trends.find((point) => point.id === "old")).toMatchObject({
    status: "pending", source: null, runningMinutes: null, walkingMinutes: null, firstRunningMinutes: null, lastRunningMinutes: null,
  })
  expect(trends.find((point) => point.id === "new")).toMatchObject({ status: "available", source: "SPEED", runningMinutes: 2 })
})
