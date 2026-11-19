import { paceSecondsPerKm } from "./format"

export type RunMetrics = {
  startDate: Date
  distance: number
  movingTime: number
}

const dayMs = 86_400_000
const weekMs = 7 * dayMs
const weekCount = 12

function summarize<T extends RunMetrics>(runs: readonly T[]) {
  let distance = 0
  let movingTime = 0
  let timedDistance = 0
  let pacedTime = 0
  let longest: T | null = null
  let fastest: T | null = null
  let fastestPace = Infinity

  for (const run of runs) {
    if (Number.isFinite(run.distance) && run.distance > 0) {
      distance += run.distance
      if (!longest || run.distance > longest.distance) longest = run
    }
    if (Number.isFinite(run.movingTime) && run.movingTime > 0) movingTime += run.movingTime
    const pace = paceSecondsPerKm(run.distance, run.movingTime)
    if (pace === null) continue
    timedDistance += run.distance
    pacedTime += run.movingTime
    if (pace < fastestPace) {
      fastest = run
      fastestPace = pace
    }
  }

  return {
    count: runs.length,
    distance,
    movingTime,
    pace: paceSecondsPerKm(timedDistance, pacedTime),
    longest,
    fastest,
  }
}

export function dashboardStats<T extends RunMetrics>(runs: readonly T[], now: Date) {
  const end = now.getTime()
  const monthStart = new Date(now)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const previousMonthStart = new Date(monthStart)
  previousMonthStart.setUTCMonth(previousMonthStart.getUTCMonth() - 1)

  const monday = new Date(now)
  monday.setUTCHours(0, 0, 0, 0)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const firstWeek = monday.getTime() - (weekCount - 1) * weekMs
  const weeklyTotals = Array.from({ length: weekCount }, (_, index) => ({
    week: new Date(firstWeek + index * weekMs).toISOString().slice(0, 10),
    distance: 0,
  }))

  const current: T[] = []
  const previous: T[] = []

  for (const run of runs) {
    const time = run.startDate.getTime()
    if (time >= monthStart.getTime() && time <= end) current.push(run)
    else if (time >= previousMonthStart.getTime() && time < monthStart.getTime()) previous.push(run)
    if (time >= firstWeek && time <= end && Number.isFinite(run.distance) && run.distance > 0) {
      weeklyTotals[Math.floor((time - firstWeek) / weekMs)].distance += run.distance
    }
  }

  return { all: summarize(runs), current: summarize(current), previous: summarize(previous), weeklyTotals }
}
