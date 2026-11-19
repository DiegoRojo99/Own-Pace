import Link from "next/link"

import { MilestoneActions } from "@/components/milestone-actions"
import { PageHeading } from "@/components/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, formatDuration } from "@/lib/format"
import { getMilestones } from "@/lib/milestones"
import { requireUser } from "@/lib/session"

export default async function MilestonesPage() {
  const user = await requireUser()
  const { records, pending, unavailable, total } = await getMilestones(user.id)

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Personal records" title="Milestones" description="Your fastest continuous efforts across your imported runs." />
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {records.map(({ key, label, effort }) => (
          <Card key={key} className="gap-0">
            <CardHeader>
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent>
              {effort ? (
                <>
                  <p className="text-2xl font-bold tabular-nums">{formatDuration(effort.elapsedTime)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <Link href={`/runs/${effort.activity.id}`} className="font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary">
                      {effort.activity.name}
                    </Link>
                    {" · "}{formatDate(effort.activity.startDate)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{pending ? "No record found in checked runs yet." : "No record found yet."}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
