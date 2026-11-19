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
  expect(html.match(/Pace:/g)).toHaveLength(2)
})
