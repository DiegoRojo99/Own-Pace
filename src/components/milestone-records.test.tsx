import { renderToStaticMarkup } from "react-dom/server"
import { expect, it } from "vitest"

import { MilestoneRecords } from "./milestone-records"

it("displays pace for recorded milestones using their distance and time", () => {
  const activity = { id: "run", name: "Run", startDate: new Date("2026-01-01T00:00:00Z") }
  const html = renderToStaticMarkup(
    <MilestoneRecords efforts={[
      { distanceKey: "2km", duration: 804, timeBasis: "MOVING", source: "SPLITS", activity },
      { distanceKey: "half-marathon", duration: 6000, timeBasis: "ELAPSED", source: "STRAVA", activity },
    ]}>
      {null}
    </MilestoneRecords>,
  )

  expect(html).toContain("Pace: 6:42 /km")
  expect(html).toContain("Pace: 4:44 /km")
  expect(html).toContain("No earlier effort recorded")
  expect(html).toContain("Personal Records")
  expect(html.match(/Pace:/g)).toHaveLength(2)
})

it("shows the previous best and improvement for a new PR", () => {
  const activity = { id: "new", name: "New run", startDate: new Date("2026-06-01T00:00:00Z") }
  const previous = { id: "old", name: "Previous run", startDate: new Date("2025-06-01T00:00:00Z") }
  const html = renderToStaticMarkup(
    <MilestoneRecords efforts={[
      { distanceKey: "5km", duration: 1500, timeBasis: "MOVING", source: "STRAVA", activity },
      { distanceKey: "5km", duration: 1560, timeBasis: "MOVING", source: "STRAVA", activity: previous },
    ]}>
      {null}
    </MilestoneRecords>,
  )

  expect(html).toContain("Previous best:")
  expect(html).toContain("Improved by 1:00")
})
