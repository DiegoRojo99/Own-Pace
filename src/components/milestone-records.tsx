"use client"

import Link from "next/link"
import { useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react"

import { PageHeading } from "@/components/page-heading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDuration } from "@/lib/format"
import { milestonePeriods, milestoneRecords, type MilestoneEffort } from "@/lib/milestone-periods"

let clock = Date.now()

function subscribeToClock(onChange: () => void) {
  clock = Date.now()
  onChange()
  const timer = setInterval(() => {
    clock = Date.now()
    onChange()
  }, 60_000)
  return () => clearInterval(timer)
}

const getClock = () => clock
const getServerClock = () => null

export function MilestoneRecords({ efforts, children }: { efforts: MilestoneEffort[]; children: ReactNode }) {
  const timestamp = useSyncExternalStore(subscribeToClock, getClock, getServerClock)
  const records = milestoneRecords(efforts, timestamp === null ? null : new Date(timestamp))
  const [selected, setSelected] = useState<(typeof milestonePeriods)[number]["key"]>("allTime")
  const id = useId()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case "ArrowRight": next = (index + 1) % milestonePeriods.length; break
      case "ArrowLeft": next = (index - 1 + milestonePeriods.length) % milestonePeriods.length; break
      case "Home": next = 0; break
      case "End": next = milestonePeriods.length - 1; break
      default: return
    }
    event.preventDefault()
    setSelected(milestonePeriods[next].key)
    tabs.current[next]?.focus()
  }

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow="Personal records"
        title="Milestones"
        description="Your fastest continuous efforts, using moving time when available."
        action={
          <div role="tablist" aria-label="Milestone period" className="flex max-w-[calc(100vw-2rem)] flex-wrap gap-1 rounded-lg bg-muted p-1 sm:max-w-none">
            {milestonePeriods.map((period, index) => (
              <button
                key={period.key}
                ref={(element) => { tabs.current[index] = element }}
                id={`${id}-${period.key}`}
                type="button"
                role="tab"
                aria-selected={selected === period.key}
                aria-controls={`${id}-panel`}
                tabIndex={selected === period.key ? 0 : -1}
                onClick={() => setSelected(period.key)}
                onKeyDown={(event) => navigateTabs(event, index)}
                className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary ${selected === period.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {period.label}
              </button>
            ))}
          </div>
        }
      />
      {children}
      <p className="text-sm text-muted-foreground">Periods use UTC; run dates are shown in your device&apos;s local timezone. The last 12 months and 90 days are rolling periods.</p>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${selected}`} tabIndex={0} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {records.map(({ key, label, periods }) => {
          const period = periods.find((item) => item.key === selected)
          if (!period) throw new Error("Unknown milestone period")
          return (
            <Card key={key} className="gap-0">
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                {period.loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : period.effort ? (
                  <>
                    <p className="text-2xl font-bold tabular-nums">{formatDuration(period.effort.duration)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {period.effort.timeBasis === "MOVING" ? "Moving time" : "Elapsed time"}
                      {" · "}{period.effort.source === "SPLITS" ? "Complete splits" : "Strava best effort"}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      <Link href={`/runs/${period.effort.activity.id}`} className="font-medium break-words text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                        {period.effort.activity.name}
                      </Link>
                      {timestamp !== null && <>{" · "}{period.effort.activity.startDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</>}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No record yet</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
