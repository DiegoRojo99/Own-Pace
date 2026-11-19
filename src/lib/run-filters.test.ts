import { describe, expect, it } from "vitest"

import { filterRuns, type RunFilterValues } from "./run-filters"

const emptyFilters: RunFilterValues = {
  search: "",
  from: "",
  to: "",
  minDistance: "",
  maxDistance: "",
  minPace: "",
  maxPace: "",
}

const runs = [
  { name: "Morning tempo", startDate: new Date("2026-03-10T07:00:00Z"), distance: 5000, movingTime: 1500 },
  { name: "Easy run", startDate: new Date("2026-03-12T07:00:00Z"), distance: 8000, movingTime: 2880 },
  { name: "Hill repeats", startDate: new Date("2026-04-02T07:00:00Z"), distance: 4000, movingTime: 1500 },
]

describe("run filters", () => {
  it("combines name, date, distance, and pace filters", () => {
    const result = filterRuns(runs, {
      ...emptyFilters,
      search: "TEMPO",
      from: "2026-03-01",
      to: "2026-03-31",
      minDistance: "4",
      maxDistance: "6",
      minPace: "4",
      maxPace: "6",
    })

    expect(result.error).toBeNull()
    expect(result.runs.map((run) => run.name)).toEqual(["Morning tempo"])
  })

  it("includes the date and distance boundaries and excludes runs without a valid pace", () => {
    const result = filterRuns([
      ...runs,
      { name: "No pace", startDate: new Date("2026-03-12T07:00:00Z"), distance: 5000, movingTime: 0 },
    ], {
      ...emptyFilters,
      from: "2026-03-12",
      to: "2026-03-12",
      minDistance: "8",
      maxDistance: "8",
      minPace: "6",
      maxPace: "6",
    })

    expect(result.runs.map((run) => run.name)).toEqual(["Easy run"])
  })

  it("reports invalid ranges instead of silently returning misleading results", () => {
    const result = filterRuns(runs, { ...emptyFilters, minDistance: "10", maxDistance: "5" })
    expect(result).toEqual({ runs: [], error: "Minimum distance must not exceed maximum distance." })
  })
})
