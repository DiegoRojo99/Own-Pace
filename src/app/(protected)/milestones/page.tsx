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
      <Card>
        <CardHeader>
          <CardTitle>Calculating records</CardTitle>
          <CardDescription>
            Estimates use Strava distance and elapsed-time samples, including stops. Each batch checks up to five runs to help manage Strava&apos;s limits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Sync your runs first to start calculating milestones."
              : pending > 0
              ? `${pending} ${pending === 1 ? "run is" : "runs are"} still waiting to be checked. Records may change as more runs are checked.`
              : "All imported runs have been checked."}
          </p>
          {unavailable > 0 && (
            <p className="text-sm text-muted-foreground">
              {unavailable} {unavailable === 1 ? "run has" : "runs have"} no usable samples or could not be found on Strava, so records may be incomplete.
            </p>
          )}
          <MilestoneActions pending={pending} unavailable={unavailable} />
        </CardContent>
      </Card>
    </MilestoneRecords>
  )
}
