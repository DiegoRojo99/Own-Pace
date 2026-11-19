const unavailable = "—"
const distanceFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

export function formatDistance(meters: number) {
  return Number.isFinite(meters) && meters >= 0
    ? `${distanceFormatter.format(meters / 1000)} km`
    : unavailable
}

export function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return unavailable
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainder = String(rounded % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`
}

export function paceSecondsPerKm(meters: number, seconds: number) {
  if (!Number.isFinite(meters) || !Number.isFinite(seconds) || meters <= 0 || seconds <= 0) return null
  const pace = (seconds / meters) * 1000
  return Number.isFinite(pace) ? pace : null
}

export function formatPaceValue(secondsPerKm: number | null) {
  if (secondsPerKm === null || !Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return unavailable
  const rounded = Math.round(secondsPerKm)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} /km`
}

export function formatPace(meters: number, seconds: number) {
  return formatPaceValue(paceSecondsPerKm(meters, seconds))
}

export function formatDate(date: Date) {
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : unavailable
}
