"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { syncRunsAction } from "@/lib/actions"

export function SyncRunsForm() {
  const [state, action, pending] = useActionState(syncRunsAction, { message: "" })

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? "Syncing activities…" : "Sync Strava activities"}
      </Button>
      <p className={`max-w-72 text-sm ${state.error ? "text-destructive" : "text-muted-foreground"}`} role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  )
}
