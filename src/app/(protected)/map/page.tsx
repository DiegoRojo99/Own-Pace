import { ActivityMap } from "@/components/activity-map"
import { SyncRunsForm } from "@/components/sync-runs-form"
import { EXPLORER_ACTIVITY_TYPES } from "@/lib/activity-types"
import { db } from "@/lib/db"
import { requireUser } from "@/lib/session"

export default async function MapPage() {
  const { id } = await requireUser()
  const routes = await db.activity.findMany({
    where: { userId: id, type: { in: EXPLORER_ACTIVITY_TYPES }, summaryPolyline: { not: null } },
    select: { id: true, name: true, type: true, startDate: true, distance: true, summaryPolyline: true },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  })

  return (
    <div className="activity-map-page flex w-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Map</h1>
          <p className="text-sm text-muted-foreground">Your imported runs and walks with GPS routes.</p>
        </div>
        <SyncRunsForm />
      </div>
      <ActivityMap routes={routes} />
    </div>
  )
}
