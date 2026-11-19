"use client"

import { useActionState, useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { RouteMap } from "@/components/route-map"
import { loadRunDetailsAction } from "@/lib/actions"

export function RunDetailsForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(loadRunDetailsAction.bind(null, runId), { message: "" })
  const form = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    // RSC revalidation preserves this client instance; do not auto-submit again.
    if (submitted.current || !form.current) return
    submitted.current = true
    form.current.requestSubmit()
  }, [])

  return (
    <div className="space-y-3">
      <form ref={form} action={action} className="space-y-3">
        {(pending || !state.message || state.error) && (
          <p role="status" aria-live="polite" className={`text-sm ${state.error && !pending ? "text-destructive" : "text-muted-foreground"}`}>
            {pending ? "Loading route and splits from Strava…" : state.message || "Run details are loaded from Strava when you open this run."}
          </p>
        )}
        {(!state.message || state.error) && (
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? "Loading…" : state.error ? "Retry loading details" : "Load details"}
          </Button>
        )}
      </form>
      {state.route && <RouteMap points={state.route} />}
      {state.route === null && <p className="text-sm text-muted-foreground">No route is available for this run on Strava.</p>}
    </div>
  )
}
