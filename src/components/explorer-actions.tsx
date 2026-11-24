"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function ExplorerActions({ pending }: { pending: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function process(reset: boolean) {
    if (reset && !window.confirm("Delete your explored tiles and rebuild them from your activities?")) return
    setBusy(true)
    setMessage(reset ? "Recalculating tiles…" : "Processing activities…")
    try {
      const response = await fetch(`/api/explorer/backfill${reset ? "?action=reset" : ""}`, { method: "POST" })
      const result: { processed?: number; remaining?: number; error?: string } = await response.json()
      if (!response.ok || result.processed === undefined || result.remaining === undefined) throw new Error(result.error ?? "Could not process activities.")
      setMessage(`Processed ${result.processed}, ${result.remaining} remaining.${result.remaining ? " Press the button again to continue." : ""}`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process activities.")
    } finally {
      setBusy(false)
    }
  }

  return <div className="space-y-2">
    <div className="flex flex-wrap gap-2">
      {pending > 0 && <Button disabled={busy} onClick={() => process(false)}>Process my activities</Button>}
      <Button variant="outline" disabled={busy} onClick={() => process(true)}>Recalculate tiles</Button>
    </div>
    <p role="status" className="text-sm text-muted-foreground">{message || `${pending} activities awaiting processing.`}</p>
  </div>
}
