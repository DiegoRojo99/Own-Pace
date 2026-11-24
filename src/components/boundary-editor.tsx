"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function BoundaryEditor({ cityId, initial }: { cityId: string; initial: string }) {
  const router = useRouter()
  const [text, setText] = useState(() => { try { return JSON.stringify(JSON.parse(initial), null, 2) } catch { return initial } })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string }>()

  async function save() {
    if (!window.confirm("Replace this boundary and rebuild its tiles?")) return
    setSaving(true)
    setMessage(undefined)
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: text })
      const data: { error?: string } = await response.json()
      if (!response.ok) throw new Error(data.error ?? "Could not save the boundary.")
      setMessage({ error: false, text: "Saved. Tiles will rebuild the next time a user opens Explorer." })
      router.refresh()
    } catch (reason) {
      setMessage({ error: true, text: reason instanceof Error ? reason.message : "Could not save the boundary." })
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-3">
    <label htmlFor="boundary" className="text-sm font-semibold">Boundary GeoJSON</label>
    <textarea id="boundary" value={text} onChange={(event) => setText(event.target.value)} spellCheck={false}
      className="block h-[60vh] w-full rounded-xl border border-border bg-card p-3 font-mono text-xs" />
    <div className="flex items-center gap-3">
      <Button type="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save boundary"}</Button>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>}
    </div>
  </div>
}
