"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { calculateMilestonesAction, retryMilestonesAction } from "@/lib/actions"

export function MilestoneActions({ pending, unavailable }: { pending: number; unavailable: number }) {
  const [calculation, calculate, calculating] = useActionState(calculateMilestonesAction, { message: "" })
  const [retry, retryAction, resetting] = useActionState(retryMilestonesAction, { message: "" })

  return (
    <div className="space-y-3">
      {pending > 0 && (
        <form action={calculate} className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={calculating || resetting}>
            {calculating ? "Checking runs…" : "Calculate next 5 runs"}
          </Button>
          <p role="status" aria-live="polite" className={`text-sm ${calculation.error ? "text-destructive" : "text-muted-foreground"}`}>
            {calculation.message}
          </p>
        </form>
      )}
      {unavailable > 0 && (
        <form action={retryAction} className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" size="sm" disabled={calculating || resetting}>
            {resetting ? "Preparing…" : "Recheck unavailable runs"}
          </Button>
          <p role="status" aria-live="polite" className={`text-sm ${retry.error ? "text-destructive" : "text-muted-foreground"}`}>
            {retry.message}
          </p>
        </form>
      )}
    </div>
  )
}
