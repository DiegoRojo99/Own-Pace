"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

type Position = number[]
type Boundary = { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] }

const polygonsOf = (boundary: Boundary) => boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates

export function BoundaryEditor({ cityId, initial }: { cityId: string; initial: string }) {
  const router = useRouter()
  const container = useRef<HTMLDivElement>(null)
  const boundary = useRef<Boundary | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string }>()

  useEffect(() => {
    let disposed = false
    let map: import("leaflet").Map | undefined
    let observer: ResizeObserver | undefined

    import("leaflet").then((L) => {
      if (disposed || !container.current) return
      boundary.current = JSON.parse(initial) as Boundary
      polygonsOf(boundary.current)
      map = L.map(container.current, { minZoom: 3, maxZoom: 19, doubleClickZoom: false })
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map)
      const layer = L.layerGroup().addTo(map)
      const toLatLng = (p: Position): [number, number] => [p[1], p[0]]
      const vertexIcon = L.divIcon({ className: "", html: '<div style="width:14px;height:14px;border-radius:50%;background:#2f9e62;border:2px solid #fff;box-shadow:0 0 3px #000"></div>', iconSize: [14, 14] })
      const midIcon = L.divIcon({ className: "", html: '<div style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #216346;opacity:.8"></div>', iconSize: [10, 10] })

      const draw = () => {
        layer.clearLayers()
        for (const polygon of polygonsOf(boundary.current!)) {
          const shape = L.polygon(polygon.map((ring) => ring.map(toLatLng)), { color: "#216346", weight: 2, fillColor: "#2f9e62", fillOpacity: 0.2, interactive: false }).addTo(layer)
          polygon.forEach((ring) => {
            const n = ring.length - 1 // last position repeats the first
            const refresh = () => shape.setLatLngs(polygon.map((r) => r.map(toLatLng)))
            for (let i = 0; i < n; i++) {
              const marker = L.marker(toLatLng(ring[i]), { icon: vertexIcon, draggable: true, title: "Drag to move, double-click to remove" }).addTo(layer)
              marker.on("drag", () => {
                const { lat, lng } = marker.getLatLng()
                ring[i] = [lng, lat]
                if (i === 0) ring[n] = [lng, lat]
                refresh()
              })
              marker.on("dragend", draw)
              marker.on("dblclick contextmenu", (event) => {
                L.DomEvent.stop(event)
                if (n <= 3) return
                ring.splice(i, 1)
                ring[ring.length - 1] = [...ring[0]]
                draw()
              })
              const next = ring[i + 1]
              L.marker([(ring[i][1] + next[1]) / 2, (ring[i][0] + next[0]) / 2], { icon: midIcon, title: "Click to add a point" }).addTo(layer).on("click", () => {
                ring.splice(i + 1, 0, [(ring[i][0] + next[0]) / 2, (ring[i][1] + next[1]) / 2])
                draw()
              })
            }
          })
        }
      }
      draw()
      const bounds = L.latLngBounds(polygonsOf(boundary.current!).flatMap((polygon) => polygon[0].map(toLatLng)))
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] })
      else map.setView([0, 0], 3)
      observer = new ResizeObserver(() => map?.invalidateSize())
      observer.observe(container.current)
      setReady(true)
    }).catch(() => { if (!disposed) setError(true) })

    return () => { disposed = true; observer?.disconnect(); map?.remove() }
  }, [initial])

  async function save() {
    if (!window.confirm("Replace this boundary and rebuild its tiles?")) return
    setSaving(true)
    setMessage(undefined)
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(boundary.current) })
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
    <p className="text-sm text-muted-foreground">Drag a green point to move it, click a white point to add one, double-click (or right-click) a green point to remove it.</p>
    <div ref={container} role="region" aria-label="Boundary editor map" className="isolate h-[65vh] min-h-96 w-full overflow-hidden rounded-2xl border border-border bg-muted" />
    {error && <p role="alert" className="text-sm text-destructive">The map could not be loaded. Reload to try again.</p>}
    <div className="flex items-center gap-3">
      <Button type="button" disabled={saving || !ready} onClick={save}>{saving ? "Saving…" : "Save boundary"}</Button>
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message.text}</p>}
    </div>
  </div>
}
