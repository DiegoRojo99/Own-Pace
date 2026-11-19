"use client"

import { useEffect, useRef, useState } from "react"

export function RouteMap({ points }: { points: [number, number][] }) {
  const container = useRef<HTMLDivElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let disposed = false
    let map: import("leaflet").Map | undefined

    import("leaflet").then((L) => {
      if (disposed || !container.current) return
      map = L.map(container.current, { scrollWheelZoom: false })
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      })
      tiles.on("tileerror", () => setError(true))
      tiles.addTo(map)
      const route = L.polyline(points, { color: "#216346", weight: 4 }).addTo(map)
      map.fitBounds(route.getBounds(), { padding: [24, 24], maxZoom: 16 })
    }).catch(() => {
      if (!disposed) setError(true)
    })

    return () => {
      disposed = true
      map?.remove()
    }
  }, [points])

  return (
    <figure>
      <div ref={container} className="h-72 w-full rounded-xl bg-muted sm:h-96" role="region" aria-label="Run route map" />
      {error && <p role="status" className="mt-2 text-sm text-destructive">The map could not be fully loaded. Check your connection and try again.</p>}
      <figcaption className="mt-2 text-xs text-muted-foreground">
        Map tiles are loaded from OpenStreetMap, which can see the area displayed.
      </figcaption>
    </figure>
  )
}
