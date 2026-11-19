import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"

import WalksPage from "./page"

const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/db", () => ({ db: { activity: { findMany } } }))
vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "walker" }) }))
vi.mock("@/components/sync-runs-form", () => ({ SyncRunsForm: () => null }))

it("ranks only the five longest walks and keeps shorter walks in the history", async () => {
  findMany.mockResolvedValue([2, 6, 3, 5, 1, 4, 0].map((km) => ({
    id: `${km}`, name: `Walk ${km}`, startDate: new Date("2026-03-19T13:05:00Z"),
    distance: km * 1000, movingTime: 1800,
  })))

  const html = renderToStaticMarkup(await WalksPage())
  const leaderboard = html.match(/<ol\b[^>]*>[\s\S]*?<\/ol>/)?.[0]
  expect(leaderboard?.match(/Walk \d/g)).toEqual(["Walk 6", "Walk 5", "Walk 4", "Walk 3", "Walk 2"])
  expect(html).toContain("Walk 1")
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { type: "Walk", userId: "walker" } }))
})
