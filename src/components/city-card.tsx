"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export type CityProgress = { id: string; name: string; label: string; ready: boolean; total: number; explored: number }
const formatNumber = (value: number) => value.toLocaleString("en-US")

function PreparingCity({ cityId }: { cityId: string }) {
  const router = useRouter()
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    async function prepare() {
      try {
        while (!controller.signal.aborted) {
          const response = await fetch(`/api/explorer/cities/prepare?cityId=${encodeURIComponent(cityId)}`, {
            method: "POST", signal: controller.signal,
          })
          const data: { done?: boolean; error?: string } = await response.json()
          if (!response.ok || typeof data.done !== "boolean") throw new Error(data.error ?? "Could not prepare this city.")
          if (data.done) { if (!controller.signal.aborted) router.refresh(); return }
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not prepare this city.")
      }
    }
    void prepare()
    return () => controller.abort()
  }, [attempt, cityId, router])

  return <div className="space-y-2">
    <p role="status" className="text-sm text-muted-foreground">{error || "Mapping this city’s tiles… Keep this page open while it prepares."}</p>
    {error && <Button size="sm" variant="outline" onClick={() => { setError(""); setAttempt((value) => value + 1) }}>Try again</Button>}
  </div>
}

export function CityCard({ city }: { city: CityProgress }) {
  const router = useRouter()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState("")
  const ratio = city.total > 0 ? Math.min(1, city.explored / city.total) : 0
  const percentage = ratio > 0 && ratio < 0.001 ? "<0.1" : ratio < 1 && ratio >= 0.999 ? "99.9" : (ratio * 100).toFixed(1).replace(/\.0$/, "")
  const circumference = 2 * Math.PI * 37

  async function remove() {
    if (!window.confirm(`Remove ${city.name} from your cities? Your explored tiles will stay.`)) return
    setRemoving(true)
    setError("")
    try {
      const response = await fetch("/api/explorer/cities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", cityId: city.id }),
      })
      const data: { error?: string } = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not remove this city.")
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this city.")
      setRemoving(false)
    }
  }

  return <article className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#216346] via-[#65a779] to-[#c3dfb8]" />
    <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.16em] text-primary uppercase">Your city</p>
        <h3 className="mt-1 truncate text-xl font-bold tracking-tight" title={city.name}>{city.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{city.label}</p>
      </div>
      <button type="button" disabled={removing} onClick={remove} className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" aria-label={`Remove ${city.name} from your cities`}>Remove</button>
    </div>
    <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
      {!city.ready ? <PreparingCity cityId={city.id} /> : city.total === 0 ? (
        <p className="text-sm text-muted-foreground">No tile centers fall inside this boundary at the current zoom.</p>
      ) : <div className="flex items-center gap-5">
        <div className="relative grid size-24 shrink-0 place-items-center" role="img" aria-label={`${percentage}% explored`}>
          <svg aria-hidden="true" viewBox="0 0 90 90" className="absolute inset-0 size-full -rotate-90">
            <circle cx="45" cy="45" r="37" fill="none" stroke="var(--color-muted)" strokeWidth="7" />
            <circle cx="45" cy="45" r="37" fill="none" stroke="var(--color-primary)" strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - ratio)} />
          </svg>
          <span className="text-lg font-bold tabular-nums">{percentage}<span className="text-xs">%</span></span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{formatNumber(city.explored)} <span className="font-normal text-muted-foreground">of {formatNumber(city.total)} tiles</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${city.name} tiles explored`} aria-valuemin={0} aria-valuemax={city.total} aria-valuenow={city.explored}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{formatNumber(city.total - city.explored)} left to explore</p>
        </div>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      {city.ready && city.total > 0 && <Button asChild size="sm" variant="ghost" className="mt-4 -ml-3 text-primary"><Link href="/map">View activity map <span aria-hidden="true">→</span></Link></Button>}
    </div>
  </article>
}
