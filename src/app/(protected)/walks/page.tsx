import { PageHeading } from "@/components/page-heading"
import { SyncRunsForm } from "@/components/sync-runs-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { walkType } from "@/lib/activity-types"
import { db } from "@/lib/db"
import { formatDate, formatDistance, formatDuration } from "@/lib/format"
import { requireUser } from "@/lib/session"

export default async function WalksPage() {
  const { id } = await requireUser()
  const walks = await db.activity.findMany({
    where: { userId: id, type: walkType },
    select: { id: true, name: true, startDate: true, distance: true, movingTime: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  })
  const longest = walks
    .filter(({ distance }) => Number.isFinite(distance) && distance > 0)
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 5)

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Activity log" title="Walks" description="Browse your Strava walks and see which ones took you the farthest." action={<SyncRunsForm />} />
      {walks.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No walks imported yet</CardTitle>
            <CardDescription>Sync Strava activities to import your walks. Older walks are picked up one page at a time, so you may need to sync again.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Longest walks</CardTitle>
              <CardDescription>Your top five imported walks by distance</CardDescription>
            </CardHeader>
            <CardContent>
              {longest.length > 0 ? (
                <ol className="divide-y divide-border" aria-label="Walk distance leaderboard">
                  {longest.map((walk, index) => (
                    <li key={walk.id} className="flex items-center gap-3 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-foreground">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium wrap-anywhere">{walk.name}</p>
                        <time className="text-sm text-muted-foreground" dateTime={walk.startDate.toISOString()}>{formatDate(walk.startDate)}</time>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatDistance(walk.distance)}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted-foreground">No walks with a recorded distance yet.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Walk history</CardTitle>
              <CardDescription>{walks.length} {walks.length === 1 ? "walk" : "walks"} imported from Strava</CardDescription>
            </CardHeader>
            <Table>
              <caption className="sr-only">Imported walks, newest first</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 sm:pl-6">Walk</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="pr-5 text-right sm:pr-6">Moving time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {walks.map((walk) => (
                  <TableRow key={walk.id}>
                    <TableCell className="pl-5 whitespace-normal sm:pl-6">
                      <p className="font-semibold wrap-anywhere">{walk.name}</p>
                      <time className="block text-xs text-muted-foreground" dateTime={walk.startDate.toISOString()}>{formatDate(walk.startDate)}</time>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatDistance(walk.distance)}</TableCell>
                    <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{formatDuration(walk.movingTime)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
