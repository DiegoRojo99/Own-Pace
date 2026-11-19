import Link from "next/link"

import { PageHeading } from "@/components/page-heading"
import { RunTable } from "@/components/run-table"
import { SyncRunsForm } from "@/components/sync-runs-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { WeeklyDistanceChart } from "@/components/weekly-distance-chart"
import { formatDistance, formatDuration, formatPace, formatPaceValue } from "@/lib/format"
import { getRuns } from "@/lib/runs"
import { requireUser } from "@/lib/session"
import { dashboardStats } from "@/lib/stats"

export default async function DashboardPage() {
  const user = await requireUser()
  const runs = await getRuns(user.id)
  const { all, current, previous, weeklyTotals } = dashboardStats(runs, new Date())
  const metrics = [
    { label: "Total distance", value: formatDistance(all.distance) },
    { label: "Runs imported", value: all.count.toLocaleString("en-US") },
    { label: "Moving time", value: formatDuration(all.movingTime) },
    { label: "Average pace", value: formatPaceValue(all.pace) },
  ]
  const comparisons = [
    { label: "Distance", current: formatDistance(current.distance), previous: formatDistance(previous.distance) },
    { label: "Runs", current: current.count, previous: previous.count },
    { label: "Moving time", current: formatDuration(current.movingTime), previous: formatDuration(previous.movingTime) },
    { label: "Average pace", current: formatPaceValue(current.pace), previous: formatPaceValue(previous.pace) },
  ]
  const longest = all.longest
  const fastest = all.fastest
  const standouts = [
    { label: "Longest run", run: longest, value: longest && formatDistance(longest.distance) },
    { label: "Fastest average pace", run: fastest, value: fastest && formatPace(fastest.distance, fastest.movingTime) },
  ]

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Training overview" title="Dashboard" description="Track your weekly distance and see how this month compares with the last." action={<SyncRunsForm />} />
      <section aria-label="All imported runs" className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="gap-0">
            <CardContent>
              <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
              <p className="mt-2 text-xl font-bold tracking-tight tabular-nums sm:text-2xl">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      {runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Import your first runs</CardTitle>
            <CardDescription>Sync Strava runs to see your distance trend, monthly comparisons, and recent activities.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Weekly distance</CardTitle>
              <CardDescription>The last 12 weeks of running, including this week so far</CardDescription>
            </CardHeader>
            <CardContent>
              <WeeklyDistanceChart data={weeklyTotals} />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Monthly comparison</CardTitle>
                <CardDescription>This month so far versus all of last month (UTC)</CardDescription>
              </CardHeader>
              <Table>
                <caption className="sr-only">Running metrics for this month so far and last month</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5 sm:pl-6">Metric</TableHead>
                    <TableHead className="text-right">This month</TableHead>
                    <TableHead className="pr-5 text-right sm:pr-6">Last month</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisons.map((row) => (
                    <TableRow key={row.label}>
                      <th scope="row" className="py-3 pr-3 pl-5 text-left text-sm font-medium sm:pl-6">{row.label}</th>
                      <TableCell className="text-right tabular-nums">{row.current}</TableCell>
                      <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{row.previous}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Standout runs</CardTitle>
                <CardDescription>From all your imported activities</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4">
                  {standouts.map(({ label, run, value }) => (
                    <div className="rounded-xl border border-border p-3" key={label}>
                      <dt className="text-sm text-muted-foreground">{label}</dt>
                      <dd className="mt-1">
                        <span className="block text-lg font-semibold tabular-nums">{value ?? "—"}</span>
                        {run && <Link href={`/runs/${run.id}`} className="rounded-sm text-sm font-medium break-words text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">{run.name}</Link>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Recent runs</CardTitle>
                <CardDescription className="mt-1">Your latest imported activities</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline"><Link href="/runs">View all runs</Link></Button>
            </CardHeader>
            <RunTable runs={runs.slice(0, 5)} caption="Recent runs" />
          </Card>
        </>
      )}
    </div>
  )
}
