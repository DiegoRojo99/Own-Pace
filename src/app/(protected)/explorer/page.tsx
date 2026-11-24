import Link from "next/link"
import { ExplorerActions } from "@/components/explorer-actions"
import { ExplorerChart } from "@/components/explorer-chart"
import { CitySearch } from "@/components/city-search"
import { PageHeading } from "@/components/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EXPLORER_ACTIVITY_TYPES, walkType } from "@/lib/activity-types"
import { db } from "@/lib/db"
import { largestCluster, largestSquare, tilesByMonth, totalTiles } from "@/lib/explorer-stats"
import { formatDate } from "@/lib/format"
import { requireUser } from "@/lib/session"
import { TILE_ZOOM } from "@/lib/tiles"

export default async function ExplorerPage() {
  const { id } = await requireUser()
  // Every query is restricted to the signed-in user's data.
  const [tiles, pending, skipped] = await Promise.all([
    db.userTile.findMany({ where: { userId: id, zoom: TILE_ZOOM }, select: { x: true, y: true, firstVisitedAt: true, firstActivityId: true } }),
    db.activity.count({ where: { userId: id, type: { in: EXPLORER_ACTIVITY_TYPES }, tilesProcessed: false, summaryPolyline: { not: null } } }),
    db.activity.count({ where: { userId: id, type: { in: EXPLORER_ACTIVITY_TYPES }, summaryPolyline: null } }),
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
  return <div className="space-y-7">
    <PageHeading eyebrow="Your activity map" title="Explorer" description="Discover the tiles your runs and walks have visited." />
    <ExplorerActions pending={pending} />
    <p className="text-sm text-muted-foreground">{skipped} activities without GPS summaries are skipped (such as treadmill or manual activities). Months use UTC.</p>
    <Card>
      <CardHeader><CardTitle>Find a city</CardTitle><CardDescription>Find and cache a city boundary for future exploration progress.</CardDescription></CardHeader>
      <CardContent><CitySearch /></CardContent>
    </Card>
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Explorer statistics">
      {stats.map((stat) => <Card key={stat.label}><CardHeader><CardDescription>{stat.label}</CardDescription><CardTitle className="text-2xl tabular-nums">{stat.value}</CardTitle></CardHeader></Card>)}
    </section>
    {tiles.length === 0 ? <Card><CardHeader><CardTitle>No tiles yet</CardTitle><CardDescription>{pending ? "Process your activities to explore your first tiles." : "Sync activities with GPS routes to get started. Older routes appear as sync scans your history."}</CardDescription></CardHeader></Card> : <>
      <Card><CardHeader><CardTitle>New tiles by month</CardTitle></CardHeader><CardContent><ExplorerChart data={months} /></CardContent></Card>
      <Card><CardHeader><CardTitle>Recently unlocked</CardTitle></CardHeader><CardContent>
        {activities.length ? <ul className="space-y-2">{activities.map((activity) => <li key={activity.id} className="text-sm">
          <Link className="font-medium text-primary hover:underline" href={activity.type === walkType ? "/walks" : `/runs/${activity.id}`}>{activity.name}</Link>
          {`, ${formatDate(activity.startDate)}: ${counts.get(activity.id)} new tiles`}
        </li>)}</ul> : <p className="text-sm text-muted-foreground">No linked activities yet.</p>}
      </CardContent></Card>
    </>}
  </div>
}
