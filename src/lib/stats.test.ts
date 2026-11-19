import { describe, expect, it } from "vitest"

import { dashboardStats } from "./stats"

const now = new Date("2026-03-15T12:00:00Z")
const run = (daysAgo: number, distance: number, movingTime: number) => ({
  startDate: new Date(now.getTime() - daysAgo * 86_400_000),
  distance,
  movingTime,
})

describe("dashboard statistics", () => {
  it("uses adjacent UTC calendar months without double counting boundary runs", () => {
    const result = dashboardStats([
      run(0, 1000, 300),
      run(14.5, 2000, 400),
      run(14.5001, 3000, 500),
      run(42.5, 4000, 600),
      run(43, 5000, 600),
      run(-1, 6000, 600),
    ], now)

    expect(result.current).toMatchObject({ count: 2, distance: 3000 })
    expect(result.previous).toMatchObject({ count: 2, distance: 7000 })
    expect(result.all.count).toBe(6)
  })

  it("groups distance into 12 Monday-based UTC weeks including empty weeks", () => {
    const result = dashboardStats([
      run(0, 1000, 300),
      run(6.5, 2000, 400),
      run(6.5001, 3000, 500),
      run(83.5, 4000, 600),
      run(83.5001, 5000, 600),
    ], now)

    expect(result.weeklyTotals).toHaveLength(12)
    expect(result.weeklyTotals[0]).toEqual({ week: "2025-12-22", distance: 4000 })
    expect(result.weeklyTotals[1].distance).toBe(0)
    expect(result.weeklyTotals.at(-2)).toEqual({ week: "2026-03-02", distance: 3000 })
    expect(result.weeklyTotals.at(-1)).toEqual({ week: "2026-03-09", distance: 3000 })
  })

  it("weights overall pace by distance and excludes runs without a valid pace", () => {
    const short = run(1, 1000, 240)
    const long = run(2, 5000, 1680)
    const result = dashboardStats([short, long, run(3, 0, 100)], now)

    expect(result.all).toMatchObject({ pace: 320, movingTime: 2020, fastest: short, longest: long })
  })

  it("leaves pace and standout runs unavailable when no runs are present", () => {
    expect(dashboardStats([], now).all).toMatchObject({ pace: null, distance: 0, longest: null, fastest: null })
  })
})
