import { MilestoneActions } from "@/components/milestone-actions"
import { MilestoneRecords } from "@/components/milestone-records"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getMilestones } from "@/lib/milestones"
import { requireUser } from "@/lib/session"

export default async function MilestonesPage() {
  const user = await requireUser()
  const { efforts, pending, unavailable, total } = await getMilestones(user.id)

  return (
    <MilestoneRecords efforts={efforts}>
      {(pending > 0 || unavailable > 0 || total === 0) && <Card>
        <CardHeader>
          <CardTitle>{pending > 0 ? "Calculating records" : unavailable > 0 ? "Unavailable runs" : "No runs imported"}</CardTitle>
          {pending > 0 && <CardDescription>
            Records use Strava&apos;s best efforts, or complete splits that exactly match a milestone. Moving time is preferred, with elapsed time as a fallback. Each batch checks up to five runs.
          </CardDescription>}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Sync your runs first to start calculating milestones."
              : pending > 0
              ? `${pending} ${pending === 1 ? "run is" : "runs are"} still waiting to be checked. Records may change as more runs are checked.`
              : null}
          </p>
          {unavailable > 0 && (
            <p className="text-sm text-muted-foreground">
              {unavailable} {unavailable === 1 ? "run has" : "runs have"} distances without a Strava best effort or exact split match, or could not be found on Strava. Records may be incomplete.
            </p>
          )}
          <MilestoneActions pending={pending} unavailable={unavailable} />
        </CardContent>
      </Card>}
    </MilestoneRecords>
  )
}
