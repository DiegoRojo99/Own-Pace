"use client"

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { cadenceTrends } from "@/lib/trends"

type Point = ReturnType<typeof cadenceTrends>[number]
const activityLabel = (point: Point) => `${formatDate(point.timestamp)} · ${point.name} · ${point.source === "SPEED" ? "Speed estimate" : "Cadence"}`
const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" })
const formatDate = (timestamp: number) => dateLabel.format(new Date(timestamp))
const minutes = (value: number) => `${value.toFixed(1)} min`
const runningColor = "var(--color-primary)"
const walkingColor = "var(--color-chart-2)"

export function CadenceTrendsChart({ data, metric }: { data: Point[]; metric: "totals" | "bouts" }) {
  const labels = new Map(data.map((point) => [point.id, point]))
  const tooltipStyle = { backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }
  return (
    <figure className="min-w-0 overflow-hidden">
      <div className="h-72 min-w-0 sm:h-80">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {metric === "totals" ? (
            <BarChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label="Walking and running minutes for each activity">
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="id" tickFormatter={(id: string) => {
                const point = labels.get(id)
                return point ? formatDate(point.timestamp) : id
              }} tickLine={false} tickMargin={8} minTickGap={20} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis domain={[0, "auto"]} tickFormatter={minutes} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} width={65} />
              <Tooltip
                cursor={{ fill: "var(--color-muted)" }}
                contentStyle={{ ...tooltipStyle, maxWidth: "min(18rem, 70vw)", whiteSpace: "normal" }}
                labelFormatter={(id) => {
                  const point = labels.get(String(id))
                  return point ? activityLabel(point) : String(id)
                }}
                formatter={(value) => typeof value === "number" ? minutes(value) : "Unavailable"}
              />
              <Legend />
              <Bar dataKey="runningMinutes" name="Running" stackId="duration" fill={runningColor} maxBarSize={40} isAnimationActive={false} />
              <Bar dataKey="walkingMinutes" name="Walking" stackId="duration" fill={walkingColor} maxBarSize={40} isAnimationActive={false} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label="First and last sustained running bout duration over time">
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="timestamp" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={formatDate} tickLine={false} tickMargin={8} minTickGap={20} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis domain={[0, "auto"]} tickFormatter={minutes} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} width={65} />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{ ...tooltipStyle, maxWidth: "min(18rem, 70vw)", whiteSpace: "normal" }}
                labelFormatter={(timestamp, payload) => {
                  const point = labels.get(String(payload[0]?.payload.id))
                  return point ? activityLabel(point) : formatDate(Number(timestamp))
                }}
                formatter={(value) => typeof value === "number" ? minutes(value) : "Unavailable"}
              />
              <Legend />
              <Line type="linear" dataKey="firstRunningMinutes" name="First running bout" stroke={runningColor} strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
              <Line type="linear" dataKey="lastRunningMinutes" name="Last running bout" stroke={walkingColor} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">
        {metric === "totals" ? "One bar per run · Sampled moving time" : "First and last sustained running bouts per activity"} · Cadence or labeled speed estimates · UTC
      </figcaption>
    </figure>
  )
}
