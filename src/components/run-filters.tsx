"use client"

import { useState, type ChangeEvent } from "react"

import { RunTable } from "@/components/run-table"
import { Button } from "@/components/ui/button"
import { filterRuns, type RunFilterValues } from "@/lib/run-filters"
import type { RunMetrics } from "@/lib/stats"

type Run = RunMetrics & { id: string; name: string }

const initialFilters: RunFilterValues = {
  search: "",
  from: "",
  to: "",
  minDistance: "",
  maxDistance: "",
  minPace: "",
  maxPace: "",
}

const inputClassName = "mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"

export function RunFilters({ runs }: { runs: readonly Run[] }) {
  const [filters, setFilters] = useState(initialFilters)
  const result = filterRuns(runs, filters)
  const update = (key: keyof RunFilterValues) =>
    (event: ChangeEvent<HTMLInputElement>) => setFilters((current) => ({ ...current, [key]: event.target.value }))

  return (
    <div className="space-y-4">
      <section aria-label="Filter runs" className="mx-5 space-y-5 rounded-xl border border-border bg-muted/30 p-4 sm:mx-6 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Filter runs</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => setFilters(initialFilters)}>
            Clear filters
          </Button>
        </div>
        <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm font-medium">
            Search name
            <input className={inputClassName} type="search" value={filters.search} onChange={update("search")} placeholder="e.g. Morning run" />
          </label>
          <label className="text-sm font-medium">
            From date
            <input className={inputClassName} type="date" value={filters.from} onChange={update("from")} />
          </label>
          <label className="text-sm font-medium">
            To date
            <input className={inputClassName} type="date" value={filters.to} onChange={update("to")} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4">
          <label className="text-sm font-medium">
            Min distance (km)
            <input className={inputClassName} type="number" min="0" step="0.1" value={filters.minDistance} onChange={update("minDistance")} />
          </label>
          <label className="text-sm font-medium">
            Max distance (km)
            <input className={inputClassName} type="number" min="0" step="0.1" value={filters.maxDistance} onChange={update("maxDistance")} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Pace from (min/km)
            <input className={inputClassName} type="number" min="0.1" step="0.1" value={filters.minPace} onChange={update("minPace")} />
          </label>
          <label className="text-sm font-medium">
            Pace to (min/km)
            <input className={inputClassName} type="number" min="0.1" step="0.1" value={filters.maxPace} onChange={update("maxPace")} />
          </label>
        </div>
      </section>
      <div
        aria-live="polite"
        className={`mx-5 flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm sm:mx-6 ${result.error ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-muted-foreground"}`}
      >
        {result.error ?? (
          <>
            <span className="font-semibold text-foreground">Showing {result.runs.length}</span>
            <span className="ml-1">of {runs.length} {runs.length === 1 ? "run" : "runs"}</span>
          </>
        )}
      </div>
      {result.runs.length > 0
        ? <RunTable runs={result.runs} caption="Filtered runs" />
        : <p className="mx-5 rounded-xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground sm:mx-6">
          {result.error ? "Adjust the filters to see matching runs." : "No runs match these filters."}
        </p>}
    </div>
  )
}
