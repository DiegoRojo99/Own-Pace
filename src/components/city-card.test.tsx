import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { CityCard } from "./city-card"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const city = { id: "city1", name: "Madrid", label: "Madrid, Spain", ready: true, available: true, explored: 3, total: 10 }

it("shows the explored fraction and an accessible progress bar", () => {
  const html = renderToStaticMarkup(<CityCard city={city} />)
  expect(html).toContain("30% explored")
  expect(html).toContain("aria-valuenow=\"3\"")
  expect(html).toContain("aria-valuemax=\"10\"")
  expect(html).toContain("7 left to explore")
})

it("does not display partial counts as finished percentages", () => {
  const html = renderToStaticMarkup(<CityCard city={{ ...city, ready: false }} />)
  expect(html).toContain("Mapping this city")
  expect(html).not.toContain("30% explored")
})

it("does not round an incomplete city up to 100%", () => {
  const html = renderToStaticMarkup(<CityCard city={{ ...city, explored: 9999, total: 10000 }} />)
  expect(html).toContain("99.9% explored")
  expect(html).not.toContain("100% explored")
})

it("shows missing catalogs without starting preparation or displaying a map link", () => {
  const html = renderToStaticMarkup(<CityCard city={{ ...city, ready: false, available: false }} />)
  expect(html).toContain("needs a new precomputed tile catalog")
  expect(html).not.toContain("Mapping this city")
  expect(html).not.toContain("View city map")
})
