import { PageHeading } from "@/components/page-heading"
import { MonthlyTrendsChart } from "@/components/monthly-trends-chart"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getRuns } from "@/lib/runs"
import { requireUser } from "@/lib/session"
import { monthlyTrends } from "@/lib/trends"

export default async function TrendsPage() {
  const user = await requireUser()
  const runs = await getRuns(user.id)
  const trends = monthlyTrends(runs, new Date())

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Training analysis" title="Trends" description="See how your monthly distance, pace, and heart rate change over time." />
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
    </div>
  )
}
