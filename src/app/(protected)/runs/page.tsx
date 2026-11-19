import { PageHeading } from "@/components/page-heading"
import { RunFilters } from "@/components/run-filters"
import { SyncRunsForm } from "@/components/sync-runs-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getRuns } from "@/lib/runs"
import { requireUser } from "@/lib/session"

export default async function RunsPage() {
  const user = await requireUser()
  const runs = await getRuns(user.id)

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Activity log" title="Runs" description="Search and filter your imported runs, or select one to see its route and kilometer splits." action={<SyncRunsForm />} />
      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>{runs.length} {runs.length === 1 ? "run" : "runs"} imported from Strava</CardDescription>
        </CardHeader>
        {runs.length > 0 ? <RunFilters runs={runs} /> : (
          <CardContent>
            <p className="rounded-xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
              No runs here yet. Sync Strava runs to import your activity history.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
