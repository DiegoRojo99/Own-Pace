import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import { cityTileSource } from "@/lib/city-catalog-data"
import { tileToBounds, TILE_ZOOM } from "@/lib/tiles"
import CityPage from "./page"

const mocks = vi.hoisted(() => ({ findCity: vi.fn(), findTiles: vi.fn(), query: vi.fn(), catalog: vi.fn() }))
vi.mock("@/lib/db", () => ({ db: {
  userCity: { findFirst: mocks.findCity },
  cityTile: { findMany: mocks.findTiles },
  $queryRaw: mocks.query,
} }))
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "owner" }) }))
vi.mock("@/lib/city-catalog", () => ({
  precomputedCity: mocks.catalog,
  savedCatalogMatches: (value: { fingerprint?: string } | null, fingerprint: string) => value?.fingerprint === fingerprint,
}))
vi.mock("@/components/city-map", () => ({ CityMap: () => <div>City map</div> }))
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found") },
  redirect: (url: string) => { throw new Error(`redirect ${url}`) },
}))

const [[south, west], [north, east]] = tileToBounds(65000, 49000, TILE_ZOOM)
const boundary = { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
const city = { name: "City", osmType: "RELATION", osmId: 42n, boundary, tilesReady: true, tileZoom: TILE_ZOOM,
  runnableTiles: { fingerprint: cityTileSource(boundary, null).fingerprint } }
const params = Promise.resolve({ cityId: "city" })

beforeEach(() => {
  vi.resetAllMocks()
  mocks.findCity.mockResolvedValue({ label: "City, Country", city })
  mocks.findTiles.mockResolvedValue([{ x: 65000, y: 49000 }])
  mocks.query.mockResolvedValue([])
  mocks.catalog.mockReturnValue(null)
})

it("opens a prepared boundary-only city and warns that tiles are unfiltered", async () => {
  const html = renderToStaticMarkup(await CityPage({ params }))
  expect(html).toContain("City map")
  expect(html).toContain("not filtered for walkability")
  expect(mocks.findCity).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner", cityId: "city" } }))
})

it("redirects until boundary tiles are rebuilt for a newly deployed catalog", async () => {
  mocks.catalog.mockReturnValue({ fingerprint: "new-catalog" })
  await expect(CityPage({ params })).rejects.toThrow("redirect /explorer")
  expect(mocks.findTiles).not.toHaveBeenCalled()
})
