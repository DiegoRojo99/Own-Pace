import { paceSecondsPerKm } from "./format"

export type RunFilterValues = {
  search: string
  from: string
  to: string
  minDistance: string
  maxDistance: string
  minPace: string
  maxPace: string
}

type FilterableRun = {
  name: string
  startDate: Date
  distance: number
  movingTime: number
}

const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value)

export function filterRuns<T extends FilterableRun>(runs: readonly T[], filters: RunFilterValues) {
  const minDistance = optionalNumber(filters.minDistance)
  const maxDistance = optionalNumber(filters.maxDistance)
  const minPace = optionalNumber(filters.minPace)
  const maxPace = optionalNumber(filters.maxPace)

  const hasInvalidDistance = [minDistance, maxDistance]
    .some((value) => value !== null && (!Number.isFinite(value) || value < 0))
  const hasInvalidPace = [minPace, maxPace]
    .some((value) => value !== null && (!Number.isFinite(value) || value <= 0))
  const hasInvalidDate = [filters.from, filters.to].some((value) =>
    value !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value),
  )

  let error: string | null = null
  if (hasInvalidDistance || hasInvalidPace || hasInvalidDate) {
    error = "Enter valid dates, non-negative distances, and positive paces."
  } else if (minDistance !== null && maxDistance !== null && minDistance > maxDistance) {
    error = "Minimum distance must not exceed maximum distance."
  } else if (minPace !== null && maxPace !== null && minPace > maxPace) {
    error = "Pace from must not exceed pace to."
  } else if (filters.from && filters.to && filters.from > filters.to) {
    error = "Start date must not be after end date."
  }

  if (error) return { runs: [] as T[], error }

  const search = filters.search.trim().toLowerCase()
  return {
    error: null,
    runs: runs.filter((run) => {
      if (search && !run.name.toLowerCase().includes(search)) return false
      const date = run.startDate.toISOString().slice(0, 10)
      if (filters.from && date < filters.from) return false
      if (filters.to && date > filters.to) return false
      if (minDistance !== null && run.distance < minDistance * 1000) return false
      if (maxDistance !== null && run.distance > maxDistance * 1000) return false
      const pace = paceSecondsPerKm(run.distance, run.movingTime)
      if (minPace !== null && (pace === null || pace < minPace * 60)) return false
      if (maxPace !== null && (pace === null || pace > maxPace * 60)) return false
      return true
    }),
  }
}
