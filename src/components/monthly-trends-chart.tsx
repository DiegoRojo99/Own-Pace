"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatDistance, formatPaceValue } from "@/lib/format"

export type MonthlyTrendPoint = {
  month: string
  distance: number
  runCount: number
  averagePace: number | null
  averageHeartrate: number | null
}

type Metric = "distance" | "pace" | "heartrate"

const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
const formatMonth = (month: string) => monthLabel.format(new Date(`${month}-01T00:00:00Z`))

const metricConfig = {
  distance: {
    dataKey: "distance",
    name: "Distance",
    tick: (value: number) => `${(value / 1000).toFixed(0)} km`,
    value: (value: number | null) => value === null ? "—" : formatDistance(value),
  },
  pace: {
    dataKey: "averagePace",
    name: "Average pace",
    tick: (value: number) => formatPaceValue(value),
    value: (value: number | null) => formatPaceValue(value),
  },
  heartrate: {
    dataKey: "averageHeartrate",
    name: "Average heart rate",
    tick: (value: number) => `${Math.round(value)} bpm`,
    value: (value: number | null) => value === null ? "—" : `${Math.round(value)} bpm`,
  },
} satisfies Record<Metric, {
  dataKey: string
  name: string
  tick: (value: number) => string
  value: (value: number | null) => string
}>

export function MonthlyTrendsChart({ data, metric }: { data: MonthlyTrendPoint[]; metric: Metric }) {
  const config = metricConfig[metric]
  return (
    <figure className="min-w-0">
      <div className="h-60 min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {metric === "distance" ? (
            <BarChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label="Monthly running distance">
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} tickMargin={8} minTickGap={14} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis tickFormatter={config.tick} domain={[0, (max: number) => Math.max(1000, max)]} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} width={62} />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }}
                labelFormatter={(month) => formatMonth(String(month))}
                formatter={(value) => config.value(typeof value === "number" ? value : null)}
              />
              <Bar dataKey={config.dataKey} name={config.name} fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label={config.name}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="month" tickFormatter={formatMonth} tickLine={false} tickMargin={8} minTickGap={14} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis
                reversed={metric === "pace"}
                allowDecimals={false}
                domain={metric === "pace" ? ["dataMin - 10", "dataMax + 10"] : ["auto", "auto"]}
                tickFormatter={config.tick}
                tickLine={false}
                axisLine={false}
                stroke="var(--color-muted-foreground)"
                fontSize={12}
                width={metric === "pace" ? 74 : 62}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }}
                labelFormatter={(month) => formatMonth(String(month))}
                formatter={(value) => config.value(typeof value === "number" ? value : null)}
              />
              <Line
                type="linear"
                dataKey={config.dataKey}
                name={config.name}
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--color-primary)" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">
        {metric === "pace" ? "Weighted by distance · Faster paces appear higher" : metric === "heartrate" ? "Weighted by moving time" : "Calendar months (UTC)"}
      </figcaption>
    </figure>
  )
}
