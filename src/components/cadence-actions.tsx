"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { calculateCadenceAction, retryCadenceAction } from "@/lib/actions"

export function CadenceActions({ pending: remaining, unavailable }: { pending: number; unavailable: number }) {
  const [loadState, loadAction, loading] = useActionState(calculateCadenceAction, { message: "" })
  const [retryState, retryAction, retrying] = useActionState(retryCadenceAction, { message: "" })
  return (
    <div className="flex flex-wrap items-start gap-4">
      {(remaining > 0 || loadState.message) && (
        <form action={loadAction} className="space-y-2">
          {remaining > 0 && <Button type="submit" disabled={loading || retrying}>{loading ? "Analyzing runs…" : "Analyze next 5 runs"}</Button>}
          <p role="status" aria-live="polite" className={`text-sm ${loadState.error ? "text-destructive" : "text-muted-foreground"}`}>{loadState.message}</p>
        </form>
      )}
      {(unavailable > 0 || retryState.message) && (
        <form action={retryAction} className="space-y-2">
          {unavailable > 0 && <Button type="submit" variant="outline" disabled={loading || retrying}>{retrying ? "Preparing…" : "Retry unavailable runs"}</Button>}
          <p role="status" aria-live="polite" className={`text-sm ${retryState.error ? "text-destructive" : "text-muted-foreground"}`}>{retryState.message}</p>
        </form>
      )}
    </div>
  )
}
