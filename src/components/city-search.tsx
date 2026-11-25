"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import type { CityCandidate } from "@/lib/city-lookup-data"

type LookupResponse = { results?: CityCandidate[]; city?: { name: string }; error?: string }

export function CitySearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CityCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function request(body: object): Promise<LookupResponse> {
    const response = await fetch("/api/explorer/cities", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data: LookupResponse = await response.json()
    if (!response.ok) throw new Error(data.error ?? "City lookup failed.")
    return data
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setResults([])
    setMessage("Searching for city boundaries…")
    try {
      const data = await request({ action: "search", query })
      if (!data.results) throw new Error("City lookup returned an invalid response.")
      setResults(data.results)
      setMessage(data.results.length ? "Choose an administrative boundary:" : "No administrative boundaries found. Try another city and country.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "City lookup failed.")
    } finally { setBusy(false) }
  }

  async function select(city: CityCandidate) {
    setBusy(true)
    setMessage("Loading the selected boundary…")
    try {
      const data = await request({ action: "select", osmType: city.osmType, osmId: city.osmId, label: city.label })
      if (!data.city) throw new Error("City lookup returned an invalid response.")
      setResults([])
      setMessage(`${data.city.name} added to your cities. Check its card for tile status.`)
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load the boundary.")
    } finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Search for a city and country, then choose its administrative boundary. New cities need an offline tile catalog build before their map is available. The search is sent to OpenStreetMap; don&apos;t enter personal information. Your activity routes are not sent.</p>
    <form onSubmit={search} className="flex flex-wrap items-end gap-2">
      <label className="grid flex-1 gap-1 text-sm font-medium" htmlFor="city-search">
        City and country
        <input id="city-search" name="city" value={query} onChange={(event) => setQuery(event.target.value)} minLength={2} maxLength={100} required
          placeholder="e.g. Madrid, Spain" className="h-9 w-full min-w-48 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <Button type="submit" disabled={busy}>{busy ? "Please wait…" : "Find city"}</Button>
    </form>
    <p role="status" className="text-sm text-muted-foreground">{message}</p>
    {results.length > 0 && <ul className="space-y-2">{results.map((city) => <li key={`${city.osmType}/${city.osmId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <span className="text-sm">{city.label}</span>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => select(city)}>Add city</Button>
    </li>)}</ul>}
    <p className="text-xs text-muted-foreground">Geocoding data © <a className="underline" href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>.</p>
  </div>
}
