"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatDistance } from "@/lib/format"

const weekLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
const formatWeek = (week: string) => weekLabel.format(new Date(week))

export function WeeklyDistanceChart({ data }: { data: { week: string; distance: number }[] }) {
  return (
    <figure className="min-w-0">
      <div className="h-60 min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label="Weekly running distance">
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="week" tickFormatter={formatWeek} tickLine={false} tickMargin={8} minTickGap={14} stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis
              tickFormatter={(meters: number) => `${meters / 1000} km`}
              domain={[0, (max: number) => Math.max(1000, max)]}
              tickLine={false}
              axisLine={false}
              stroke="var(--color-muted-foreground)"
              fontSize={12}
              width={62}
            />
            <Tooltip
              cursor={{ fill: "var(--color-muted)" }}
              contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }}
              labelFormatter={(week) => `Week of ${formatWeek(String(week))}`}
              formatter={(value) => typeof value === "number" ? formatDistance(value) : "—"}
            />
            <Bar dataKey="distance" name="Distance" fill="var(--color-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">Week starting Monday (UTC)</figcaption>
    </figure>
  )
}
