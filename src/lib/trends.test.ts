import { describe, expect, it } from "vitest"

import { monthlyTrends } from "./trends"

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
