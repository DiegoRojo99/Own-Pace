"use client"

import { useEffect, useRef, useState } from "react"
import { tileToBounds } from "@/lib/tiles"

type TileList = [number, number][]

export function CityMap({ explored, unexplored, zoom }: { explored: TileList; unexplored: TileList; zoom: number }) {
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let disposed = false
    let map: import("leaflet").Map | undefined
    let observer: ResizeObserver | undefined

    import("leaflet").then((leaflet) => {
      if (disposed || !container.current) return
      map = leaflet.map(container.current, { preferCanvas: true, minZoom: 5, maxZoom: 19 })
      leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map)
      const renderer = leaflet.canvas({ padding: 0.3 })
      const bounds = leaflet.latLngBounds([])
      const draw = (tiles: TileList, style: import("leaflet").PathOptions) => {
        for (const [x, y] of tiles) {
          const rect = leaflet.rectangle(tileToBounds(x, y, zoom), { renderer, interactive: false, ...style }).addTo(map!)
          bounds.extend(rect.getBounds())
        }
      }
      // Fog first so explored tiles are drawn on top.
      draw(unexplored, { stroke: false, fillColor: "#4b5563", fillOpacity: 0.55 })
      draw(explored, { color: "#216346", weight: 1, opacity: 0.6, fillColor: "#2f9e62", fillOpacity: 0.25 })
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] })
      else map.setView([0, 0], 5)
      observer = new ResizeObserver(() => map?.invalidateSize())
      observer.observe(container.current)
    }).catch(() => { if (!disposed) setError(true) })

    return () => { disposed = true; observer?.disconnect(); map?.remove() }
  }, [explored, unexplored, zoom])

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm border border-[#216346] bg-[#2f9e62]/40" />Explored</span>
      <span className="inline-flex items-center gap-2"><span className="size-3 rounded-sm bg-[#4b5563]/60" />Not yet explored</span>
    </div>
    <div ref={container} role="region" aria-label="City exploration map" className="isolate h-[70vh] min-h-96 w-full overflow-hidden rounded-2xl border border-border bg-muted" />
    {error && <p role="status" className="text-sm text-destructive">The map could not be loaded. Reload to try again.</p>}
    <p className="text-xs text-muted-foreground">OpenStreetMap can see the area displayed. Tiles are only those whose centers fall inside the city boundary.</p>
  </div>
}
