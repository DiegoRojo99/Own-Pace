"use client"

import type { LatLngBounds, Map as LeafletMap } from "leaflet"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { walkType } from "@/lib/activity-types"
import { formatDate, formatDistance } from "@/lib/format"
import { decodePolyline } from "@/lib/polyline"
import { TILE_ZOOM, tileToBounds } from "@/lib/tiles"

type ActivityRoute = {
  id: string
  name: string
  type: string
  startDate: Date
  distance: number
  summaryPolyline: string | null
}

const colors = { run: "#216346", walk: "#254eb0" }
const fitOptions = { padding: [24, 24] as [number, number], maxZoom: 16 }

export function ActivityMap({ routes }: { routes: ActivityRoute[] }) {
  const container = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<{ map: LeafletMap; bounds: LatLngBounds; leaflet: typeof import("leaflet"); skipped: number }>()
  const [showTiles, setShowTiles] = useState(false)
  const [error, setError] = useState(false)
  const [tileError, setTileError] = useState(false)
  const [showExplorer, setShowExplorer] = useState(false)
  const [explorerStatus, setExplorerStatus] = useState("")

  useEffect(() => {
    let disposed = false
    let map: LeafletMap | undefined
    let observer: ResizeObserver | undefined

    import("leaflet").then((leaflet) => {
      if (disposed || !container.current) return
      map = leaflet.map(container.current, { preferCanvas: true, minZoom: 1, maxZoom: 19 })
      const bounds = leaflet.latLngBounds([])
      let skipped = 0
      for (const route of routes) {
        let points: ReturnType<typeof decodePolyline>
        try {
          points = decodePolyline(route.summaryPolyline ?? "")
        } catch {
          skipped++
          continue
        }
        if (points.length < 2) {
          skipped++
          continue
        }

        const isWalk = route.type === walkType
        const path = leaflet.polyline(points, { color: isWalk ? colors.walk : colors.run, weight: 4, opacity: 0.8 })
        const popup = document.createElement("div")
        const name = document.createElement("strong")
        name.textContent = route.name
        popup.append(name, document.createElement("br"),
          `${isWalk ? "Walk" : "Run"} · ${formatDate(route.startDate)} · ${formatDistance(route.distance)}`)
        path.bindPopup(popup).addTo(map)
        bounds.extend(path.getBounds())
      }

      if (bounds.isValid()) map.fitBounds(bounds, fitOptions)
      else map.setView([0, 0], 2)

      observer = new ResizeObserver(() => map?.invalidateSize())
      observer.observe(container.current)
      setView({ map, bounds, leaflet, skipped })
      setError(false)
    }).catch(() => {
      if (disposed) return
      map?.remove()
      map = undefined
      setError(true)
    })

    return () => {
      disposed = true
      observer?.disconnect()
      map?.remove()
    }
  }, [routes])

  useEffect(() => {
    if (!showTiles || !view) return
    const tiles = view.leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    })
    tiles.on("tileerror", () => setTileError(true))
    tiles.addTo(view.map)
    return () => { tiles.remove() }
  }, [showTiles, view])

  useEffect(() => {
    if (!showExplorer || !view) return
    const controller = new AbortController()
    const pane = view.map.getPane("explorer") ?? view.map.createPane("explorer")
    pane.style.zIndex = "350"
    pane.style.pointerEvents = "none"
    const renderer = view.leaflet.canvas({ pane: "explorer" })
    const group = view.leaflet.layerGroup().addTo(view.map)
    fetch("/api/explorer/tiles", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load explorer tiles.")
      const data: { zoom: number; tiles: [number, number][] } = await response.json()
      if (controller.signal.aborted) return
      if (data.zoom !== TILE_ZOOM) throw new Error("Explorer tile zoom does not match.")
      for (const [x, y] of data.tiles) {
        view.leaflet.rectangle(tileToBounds(x, y, data.zoom), {
          renderer, pane: "explorer", color: "#216346", weight: 1, opacity: 0.45, fillOpacity: 0.15, interactive: false,
        }).addTo(group)
      }
      setExplorerStatus(data.tiles.length ? "" : "No explored tiles yet. Visit Explorer to process your activities.")
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setExplorerStatus(error instanceof Error ? error.message : "Could not load explorer tiles.")
    })
    return () => { controller.abort(); group.remove(); renderer.remove() }
  }, [showExplorer, view])

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2 text-sm sm:px-6">
        <span className="inline-flex items-center gap-2"><span className="h-1 w-5 rounded-full" style={{ backgroundColor: colors.run }} />Runs</span>
        <span className="inline-flex items-center gap-2"><span className="h-1 w-5 rounded-full" style={{ backgroundColor: colors.walk }} />Walks</span>
        <Button type="button" size="sm" variant="outline" disabled={!view?.bounds.isValid() || error} onClick={() => view?.map.fitBounds(view.bounds, fitOptions)}>
          Fit all routes
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!view || error} aria-describedby="basemap-privacy" onClick={() => {
          setTileError(false)
          setShowTiles((shown) => !shown)
        }}>
          {showTiles ? "Hide street map" : "Show street map"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!view || error} aria-pressed={showExplorer} onClick={() => {
          setExplorerStatus(showExplorer ? "" : "Loading explorer tiles…")
          setShowExplorer((shown) => !shown)
        }}>Explorer tiles: {showExplorer ? "on" : "off"}</Button>
        <span id="basemap-privacy" className="text-xs text-muted-foreground">OpenStreetMap can see the area displayed when enabled.</span>
      </div>
      {showExplorer && explorerStatus && <p role="status" className="border-b border-border bg-card px-4 py-2 text-sm text-muted-foreground">{explorerStatus}</p>}
      <div className="relative isolate flex min-h-64 flex-1 bg-muted">
        <div ref={container} className="flex-1" role="region" aria-label="Activity routes map" />
        {(error || (showTiles && tileError) || !view || !view.bounds.isValid() || view.skipped > 0) && (
          <p role="status" className="absolute top-3 right-3 z-[1000] ml-16 max-w-sm rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
            {error ? "The map could not be loaded. Reload to try again."
              : !view ? "Loading map…"
                : !view.bounds.isValid() ? "No usable GPS routes yet. Sync Strava activities to load routes, one history page at a time."
                  : showTiles && tileError ? "Some street map tiles could not be loaded. Your routes are still visible."
                    : `${view.skipped} ${view.skipped === 1 ? "route could" : "routes could"} not be displayed.`}
          </p>
        )}
      </div>
    </>
  )
}
