import Link from "next/link"
import { CadenceActions } from "@/components/cadence-actions"
import { CadenceTrendsChart } from "@/components/cadence-trends-chart"
import { PageHeading } from "@/components/page-heading"
import { MonthlyTrendsChart } from "@/components/monthly-trends-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BOUT_GAP_SECONDS, MIN_BOUT_SECONDS, RUNNING_CADENCE, RUNNING_PACE_SECONDS } from "@/lib/cadence-calculation"
import { formatPaceValue } from "@/lib/format"
import { getRuns } from "@/lib/runs"
import { requireUser } from "@/lib/session"
import { cadenceTrends, monthlyTrends } from "@/lib/trends"

const formatDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const formatMinutes = (value: number | null) => value === null ? "—" : `${value.toFixed(1)} min`

export default async function TrendsPage() {
  const user = await requireUser()
  const runs = await getRuns(user.id)
  const trends = monthlyTrends(runs, new Date())
  const cadence = cadenceTrends(runs)
  const pending = cadence.filter((point) => point.status === "pending").length
  const unavailable = cadence.filter((point) => point.status === "unavailable").length
  const available = cadence.length - pending - unavailable
  const estimated = cadence.filter((point) => point.status === "available" && point.source === "SPEED").length

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Training analysis" title="Trends" description="Track your monthly training and how your running and walking change over time." />
      {runs.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No trends yet</CardTitle>
            <CardDescription>Sync your Strava runs to see your training history.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <section aria-label="Monthly running trends" className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Monthly distance</CardTitle>
              <CardDescription>Running volume across the last 12 calendar months</CardDescription>
            </CardHeader>
            <CardContent><MonthlyTrendsChart data={trends} metric="distance" /></CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Average pace</CardTitle>
              <CardDescription>Combined moving time divided by distance for each month</CardDescription>
            </CardHeader>
            <CardContent><MonthlyTrendsChart data={trends} metric="pace" /></CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Average heart rate</CardTitle>
              <CardDescription>Average run heart rate, weighted by moving time</CardDescription>
            </CardHeader>
            <CardContent><MonthlyTrendsChart data={trends} metric="heartrate" /></CardContent>
          </Card>
        </section>
      )}
      <p className="text-sm text-muted-foreground">Monthly periods use UTC. Pace includes runs with valid distance and moving time; heart rate includes runs where Strava provided an average.</p>
      {runs.length > 0 && (
        <section aria-labelledby="cadence-heading" className="space-y-4">
          <div className="space-y-2">
            <h2 id="cadence-heading" className="text-2xl font-semibold tracking-tight">Running &amp; walking</h2>
            <p className="text-sm text-muted-foreground">
              Moving samples at {RUNNING_CADENCE} steps/min or above count as running; below counts as walking.
              Strava run cadence is doubled to total steps/min. When cadence is absent, speed is used instead:
              {" "}{formatPaceValue(RUNNING_PACE_SECONDS)} or faster counts as running. Speed-based results are estimates, not measured cadence.
            </p>
            <p className="text-sm text-muted-foreground" role="status">
              {available} of {runs.length} runs analyzed ({estimated} speed estimates) · {pending} pending or needing recalculation · {unavailable} without usable streams
            </p>
            <CadenceActions pending={pending} unavailable={unavailable} />
          </div>
          {available > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Running vs walking per activity</CardTitle>
                  <CardDescription>Minutes spent running and walking in each imported run</CardDescription>
                </CardHeader>
                <CardContent><CadenceTrendsChart data={cadence} metric="totals" /></CardContent>
              </Card>
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Opening &amp; closing running bouts</CardTitle>
                  <CardDescription>Your first and last sustained running bouts, ignoring brief interruptions</CardDescription>
                </CardHeader>
                <CardContent><CadenceTrendsChart data={cadence} metric="bouts" /></CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>No running &amp; walking trends yet</CardTitle>
                <CardDescription>
                  {pending > 0 ? "Analyze your runs using the updated calculation, five at a time. Older results stay hidden until recalculated." : "Strava did not provide usable time, moving, and cadence or speed/distance streams. You can retry unavailable runs."}
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          <p className="text-sm text-muted-foreground">
            Bouts bridge walking or stopped interruptions of up to {BOUT_GAP_SECONDS} seconds and must contain at least {MIN_BOUT_SECONDS} seconds of running.
            Walking and stopped seconds never count toward running duration; this tolerance does not change running/walking totals.
            First and last bouts ignore walking warm-ups, cool-downs, and short running bursts. A single qualifying bout counts as both; no qualifying bouts is shown as zero.
            Durations use intervals between Strava samples, so totals may differ from the activity&apos;s reported moving time.
            Speed uses Strava&apos;s smoothed velocity where available, otherwise distance changes over time.
            Missing cadence alone no longer excludes a run. Runs without any usable classification streams leave gaps in the lines.
          </p>
          <details className="rounded-xl border bg-card p-4">
            <summary className="cursor-pointer text-sm font-medium">View per-activity durations</summary>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity (UTC)</TableHead>
                  <TableHead>Running</TableHead>
                  <TableHead>Walking</TableHead>
                  <TableHead>First running bout</TableHead>
                  <TableHead>Last running bout</TableHead>
                  <TableHead>Analysis source / status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cadence.map((point) => (
                  <TableRow key={point.id}>
                    <TableCell>
                      <Link href={`/runs/${point.id}`} className="font-medium text-primary hover:underline">{point.name}</Link>
                      <p className="text-xs text-muted-foreground">{formatDate.format(new Date(point.timestamp))}</p>
                    </TableCell>
                    <TableCell>{formatMinutes(point.runningMinutes)}</TableCell>
                    <TableCell>{formatMinutes(point.walkingMinutes)}</TableCell>
                    <TableCell>{formatMinutes(point.firstRunningMinutes)}</TableCell>
                    <TableCell>{formatMinutes(point.lastRunningMinutes)}</TableCell>
                    <TableCell>{point.status === "available" ? point.source === "SPEED" ? "Speed estimate" : "Cadence" : point.status === "pending" ? "Needs analysis" : "No usable streams"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </section>
      )}
    </div>
  )
}
