import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeading } from "@/components/page-heading"
import { RunDetailsForm } from "@/components/run-details-form"
import { SplitPaceChart } from "@/components/split-pace-chart"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatDistance, formatDuration, formatPace, paceSecondsPerKm } from "@/lib/format"
import { db } from "@/lib/db"
import { TILE_ZOOM } from "@/lib/tiles"
import { getRun } from "@/lib/runs"
import { requireUser } from "@/lib/session"

const formatElevation = (meters: number) => `${Math.round(meters).toLocaleString("en-US")} m`
const formatHeartRate = (bpm: number | null) => bpm === null ? "—" : `${Math.round(bpm)} bpm`

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const run = await getRun(user.id, id)
  if (!run) notFound()
  // Count tiles only for this signed-in user's run.
  const unlocked = await db.userTile.count({ where: { userId: user.id, firstActivityId: run.id, zoom: TILE_ZOOM } })

  const metrics = [
    { label: "Distance", value: formatDistance(run.distance) },
    { label: "Moving time", value: formatDuration(run.movingTime) },
    { label: "Average pace", value: formatPace(run.distance, run.movingTime) },
    { label: "Elapsed time", value: formatDuration(run.elapsedTime) },
    { label: "Elevation gain", value: formatElevation(run.elevationGain) },
    { label: "Average heart rate", value: formatHeartRate(run.averageHeartrate) },
  ]
  const chartData = run.splits.map((split) => ({
    index: split.index,
    pace: paceSecondsPerKm(split.distance, split.movingTime),
  }))
  const showHeartRate = run.splits.some((split) => split.averageHeartrate !== null)

  return (
    <div className="space-y-7">
      <Button asChild size="sm" variant="ghost" className="-ml-2">
        <Link href="/runs"><span aria-hidden="true">←</span> All runs</Link>
      </Button>
      <PageHeading eyebrow="Run detail" title={run.name} description={formatDate(run.startDate)} />
      {unlocked > 0 && <p className="text-sm text-muted-foreground">This run unlocked {unlocked} new {unlocked === 1 ? "tile" : "tiles"}.</p>}
      <Card>
        <CardHeader>
          <CardTitle>Run summary</CardTitle>
          <CardDescription>Average pace is calculated from moving time and distance.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-border bg-muted/40 p-3">
                <dt className="text-sm text-muted-foreground">{metric.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Route</CardTitle>
          <CardDescription>Route data from Strava, when available.</CardDescription>
        </CardHeader>
        <CardContent>
          <RunDetailsForm key={run.id} runId={run.id} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Kilometer splits</CardTitle>
          <CardDescription>Per-split metrics from Strava. The final split may be shorter than a kilometer.</CardDescription>
        </CardHeader>
        {run.splits.length > 0 ? (
          <>
            <CardContent>
              {chartData.some((split) => split.pace !== null)
                ? <SplitPaceChart data={chartData} />
                : <p className="text-sm text-muted-foreground">Pace is unavailable for these splits.</p>}
            </CardContent>
            <Table>
              <caption className="sr-only">Kilometer splits for {run.name}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5 sm:pl-6">Split</TableHead>
                  <TableHead className="text-right">Distance</TableHead>
                  <TableHead className="text-right">Moving time</TableHead>
                  <TableHead className="text-right">Pace</TableHead>
                  <TableHead className={showHeartRate ? "text-right" : "pr-5 text-right sm:pr-6"}>Elevation change</TableHead>
                  {showHeartRate && <TableHead className="pr-5 text-right sm:pr-6">Avg. heart rate</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.splits.map((split) => (
                  <TableRow key={split.id}>
                    <th scope="row" className="px-3 py-3 pl-5 text-left font-semibold tabular-nums sm:pl-6">{split.index}</th>
                    <TableCell className="text-right tabular-nums">{formatDistance(split.distance)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDuration(split.movingTime)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPace(split.distance, split.movingTime)}</TableCell>
                    <TableCell className={showHeartRate ? "text-right tabular-nums" : "pr-5 text-right tabular-nums sm:pr-6"}>{formatElevation(split.elevationDifference)}</TableCell>
                    {showHeartRate && <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{formatHeartRate(split.averageHeartrate)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <CardContent>
            {run.detailFetched
              ? <p className="text-sm text-muted-foreground">Strava doesn&apos;t have kilometer splits for this run.</p>
              : <p className="text-sm text-muted-foreground">Splits are loaded with the route above.</p>}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
