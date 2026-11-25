import Link from "next/link"
import { ExplorerActions } from "@/components/explorer-actions"
import { ExplorerChart } from "@/components/explorer-chart"
import { CitySearch } from "@/components/city-search"
import { CityCard } from "@/components/city-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EXPLORER_ACTIVITY_TYPES, walkType } from "@/lib/activity-types"
import { db } from "@/lib/db"
import { getCityProgress } from "@/lib/city-progress"
import { largestCluster, largestSquare, tilesByMonth, totalTiles } from "@/lib/explorer-stats"
import { formatDate } from "@/lib/format"
import { requireUser } from "@/lib/session"
import { TILE_ZOOM } from "@/lib/tiles"

export default async function ExplorerPage() {
  const { id } = await requireUser()
  // Every query is restricted to the signed-in user's data.
  const [tiles, pending, skipped, cities] = await Promise.all([
    db.userTile.findMany({ where: { userId: id, zoom: TILE_ZOOM }, select: { x: true, y: true, firstVisitedAt: true, firstActivityId: true } }),
    db.activity.count({ where: { userId: id, type: { in: EXPLORER_ACTIVITY_TYPES }, tilesProcessed: false, summaryPolyline: { not: null } } }),
    db.activity.count({ where: { userId: id, type: { in: EXPLORER_ACTIVITY_TYPES }, summaryPolyline: null } }),
    getCityProgress(id),
  ])
  const counts = new Map<string, number>()
  for (const tile of tiles) if (tile.firstActivityId) counts.set(tile.firstActivityId, (counts.get(tile.firstActivityId) ?? 0) + 1)
  // Activity IDs in tiles do not replace the ownership filter.
  const activities = await db.activity.findMany({
    where: { userId: id, id: { in: [...counts.keys()] } },
    select: { id: true, name: true, type: true, startDate: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }], take: 10,
  })
  const keys = new Set(tiles.map(({ x, y }) => `${x}/${y}`))
  const square = largestSquare(keys)
  const months = tilesByMonth(tiles)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const stats = [
    { label: "Tiles explored", value: totalTiles(keys) },
    { label: "Largest square", value: `${square} x ${square}` },
    { label: "Largest connected cluster", value: largestCluster(keys) },
    { label: "Tiles explored this month", value: months.find((month) => month.month === thisMonth)?.count ?? 0 },
  ]
  return <div className="space-y-9">
    <header className="relative overflow-hidden rounded-3xl bg-[#183e2d] px-6 py-8 text-white sm:px-9 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 opacity-20 sm:block" style={{ backgroundImage: "linear-gradient(#bfe6c8 1px, transparent 1px), linear-gradient(90deg, #bfe6c8 1px, transparent 1px)", backgroundSize: "38px 38px", maskImage: "linear-gradient(to right, transparent, black)" }} />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <p className="text-xs font-bold tracking-[0.2em] text-[#b8dfc2] uppercase">Your world, one tile at a time</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Explorer</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#d3e8d9] sm:text-base">Every run and walk adds to your map. Pick a city and see how much of it you&apos;ve explored.</p>
        </div>
        <Button asChild variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"><Link href="/map">Open your map <span aria-hidden="true">→</span></Link></Button>
      </div>
    </header>

    <section aria-label="Explorer statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat, index) => <div key={stat.label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{stat.label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{typeof stat.value === "number" ? stat.value.toLocaleString("en-US") : stat.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{["Your footprint", "Fully explored", "Connected tiles", "New in UTC"][index]}</p>
      </div>)}
    </section>

    <section aria-labelledby="cities-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">Explore closer</p><h2 id="cities-heading" className="mt-1 text-2xl font-bold tracking-tight">Your cities</h2><p className="mt-1 text-sm text-muted-foreground">Follow your footprint across the places you care about.</p></div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">{cities.length} {cities.length === 1 ? "city" : "cities"}</span>
      </div>
      {pending > 0 && <p role="status" className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-secondary-foreground">{pending} activities still need processing; city progress may increase when they&apos;re finished.</p>}
      {cities.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{cities.map((city) => <CityCard key={city.id} city={city} />)}</div> : (
        <div className="rounded-2xl border border-dashed border-[#aac8b4] bg-[#eef6f0] px-6 py-8 text-center">
          <div aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-xl text-primary shadow-sm">⌖</div>
          <h3 className="mt-4 text-lg font-semibold">Start exploring a city</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Search for a place below. Your existing activities will count towards its progress.</p>
        </div>
      )}
      <details open={cities.length === 0} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <summary className="cursor-pointer rounded-sm text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">+ Add a city</summary>
        <div className="mt-5"><CitySearch /></div>
      </details>
      <p className="text-xs leading-relaxed text-muted-foreground">City totals use the administrative boundary, filtered by OpenStreetMap walking paths when a catalog is available. Unfiltered tiles may be inaccessible. Map data may be incomplete or out of date; always follow local access signs.</p>
    </section>

    <section aria-labelledby="activity-heading" className="space-y-4">
      <div><p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">Your journey</p><h2 id="activity-heading" className="mt-1 text-2xl font-bold tracking-tight">Exploration over time</h2></div>
      {tiles.length === 0 ? <Card><CardHeader><CardTitle>No tiles yet</CardTitle><CardDescription>{pending ? "Process your activities to explore your first tiles." : "Sync activities with GPS routes to get started. Older routes appear as sync scans your history."}</CardDescription></CardHeader></Card> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="min-w-0"><CardHeader><CardTitle>New tiles by month</CardTitle><CardDescription>First visits · UTC</CardDescription></CardHeader><CardContent><ExplorerChart data={months} /></CardContent></Card>
          <Card className="min-w-0"><CardHeader><CardTitle>Recently unlocked</CardTitle><CardDescription>Your latest first visits</CardDescription></CardHeader><CardContent>
            {activities.length ? <ul className="divide-y divide-border">{activities.map((activity) => <li key={activity.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0"><Link className="block truncate text-sm font-semibold text-primary hover:underline" href={activity.type === walkType ? "/walks" : `/runs/${activity.id}`}>{activity.name}</Link><p className="mt-1 text-xs text-muted-foreground">{formatDate(activity.startDate)}</p></div>
              <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">+{counts.get(activity.id)} tiles</span>
            </li>)}</ul> : <p className="text-sm text-muted-foreground">No linked activities yet.</p>}
          </CardContent></Card>
        </div>
      )}
    </section>
    <details open={pending > 0} className="rounded-2xl border border-border bg-card p-5">
      <summary className="cursor-pointer text-sm font-semibold">Activity processing</summary>
      <div className="mt-4 space-y-3"><ExplorerActions pending={pending} /><p className="text-xs text-muted-foreground">{skipped} activities without GPS summaries are skipped, such as treadmill or manual activities.</p></div>
    </details>
  </div>
}
