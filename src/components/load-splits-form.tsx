"use client"

import { useActionState, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { loadSplitsAction } from "@/lib/actions"

export function LoadSplitsForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(loadSplitsAction.bind(null, runId), { message: "" })
  const form = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    // RSC revalidation preserves this client instance; do not auto-submit again.
    if (submitted.current || !form.current) return
    submitted.current = true
    form.current.requestSubmit()
  }, [])

  return (
    <form ref={form} action={action} className="space-y-3">
      <p role="status" aria-live="polite" className={`text-sm ${state.error && !pending ? "text-destructive" : "text-muted-foreground"}`}>
        {pending ? "Checking Strava for kilometer splits…" : state.message || "Split data is loaded from Strava when you open this run."}
      </p>
      {(!state.message || state.error) && (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Loading…" : state.error ? "Retry loading splits" : "Load splits"}
        </Button>
      )}
    </form>
  )
}
