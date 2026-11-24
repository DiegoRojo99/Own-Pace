"use client"

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

export function ExplorerChart({ data }: { data: { month: string; count: number }[] }) {
  return <div className="h-60 min-w-0">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} aria-label="Tiles unlocked per month" margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="month" tickLine={false} tickMargin={8} minTickGap={14} stroke="var(--color-muted-foreground)" fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} />
        <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", borderRadius: 10 }} />
        <Bar dataKey="count" name="New tiles" fill="var(--color-primary)" maxBarSize={40} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  </div>
}
