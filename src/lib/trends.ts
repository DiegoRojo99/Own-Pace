import { paceSecondsPerKm } from "./format"

export type TrendRun = {
  startDate: Date
  distance: number
  movingTime: number
  averageHeartrate: number | null
}

const monthCount = 12

export function monthlyTrends(runs: readonly TrendRun[], now: Date) {
  const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const months = Array.from({ length: monthCount }, (_, index) => {
    const start = new Date(currentMonth)
    start.setUTCMonth(start.getUTCMonth() - (monthCount - index - 1))
    return {
      month: start.toISOString().slice(0, 7),
      distance: 0,
      runCount: 0,
      pacedDistance: 0,
      pacedTime: 0,
      heartRateTime: 0,
      heartRateMovingTime: 0,
    }
  })

  const monthIndexes = new Map(months.map((month, index) => [month.month, index]))
  for (const run of runs) {
    const month = run.startDate.toISOString().slice(0, 7)
    const index = monthIndexes.get(month)
    if (index === undefined || run.startDate.getTime() > now.getTime()) continue

    const bucket = months[index]
    bucket.runCount++
    if (Number.isFinite(run.distance) && run.distance > 0) bucket.distance += run.distance
    if (Number.isFinite(run.distance) && run.distance > 0 && Number.isFinite(run.movingTime) && run.movingTime > 0) {
      bucket.pacedDistance += run.distance
      bucket.pacedTime += run.movingTime
      if (run.averageHeartrate !== null && Number.isFinite(run.averageHeartrate) && run.averageHeartrate > 0) {
        bucket.heartRateTime += run.averageHeartrate * run.movingTime
        bucket.heartRateMovingTime += run.movingTime
      }
    }
  }

  return months.map(({ month, distance, runCount, pacedDistance, pacedTime, heartRateTime, heartRateMovingTime }) => ({
    month,
    distance,
    runCount,
    averagePace: paceSecondsPerKm(pacedDistance, pacedTime),
    averageHeartrate: heartRateMovingTime > 0 ? heartRateTime / heartRateMovingTime : null,
  }))
}
