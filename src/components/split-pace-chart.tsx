"use client"

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatPaceValue } from "@/lib/format"

export function SplitPaceChart({ data }: { data: { index: number; pace: number | null }[] }) {
  return (
    <figure className="min-w-0">
      <div className="h-64 min-w-0 sm:h-72">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: 0 }} aria-label="Average pace by split">
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="index" tickLine={false} tickMargin={8} stroke="var(--color-muted-foreground)" fontSize={12} />
            <YAxis
              reversed
              allowDecimals={false}
              domain={["dataMin - 10", "dataMax + 10"]}
              tickFormatter={(value: number) => formatPaceValue(value)}
              tickLine={false}
              axisLine={false}
              stroke="var(--color-muted-foreground)"
              fontSize={12}
              width={74}
            />
            <Tooltip
              cursor={{ stroke: "var(--color-border)" }}
              contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }}
              labelFormatter={(value) => `Split ${value}`}
              formatter={(value) => formatPaceValue(typeof value === "number" ? value : null)}
            />
            <Line
              type="linear"
              dataKey="pace"
              name="Pace"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-primary)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-1 text-center text-xs text-muted-foreground">Split number · Faster paces appear higher</figcaption>
    </figure>
  )
}
