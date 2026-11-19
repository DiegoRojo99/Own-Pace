import { describe, expect, it } from "vitest"

import { formatDate, formatDistance, formatDuration, formatPace, formatPaceValue, paceSecondsPerKm } from "./format"

describe("running metric formatting", () => {
  it("converts meters to kilometers with two decimal places", () => {
    expect(formatDistance(12345)).toBe("12.35 km")
    expect(formatDistance(0)).toBe("0.00 km")
    expect(formatDistance(-1)).toBe("—")
    expect(formatDistance(Infinity)).toBe("—")
  })

  it("formats moving time and carries seconds into minutes and hours", () => {
    expect(formatDuration(0)).toBe("0:00")
    expect(formatDuration(65)).toBe("1:05")
    expect(formatDuration(3599.8)).toBe("1:00:00")
    expect(formatDuration(3661)).toBe("1:01:01")
    expect(formatDuration(NaN)).toBe("—")
  })

  it("calculates pace from distance and time rather than raw speed", () => {
    expect(paceSecondsPerKm(5000, 1575)).toBe(315)
    expect(formatPace(5000, 1575)).toBe("5:15 /km")
    expect(formatPaceValue(359.8)).toBe("6:00 /km")
    expect(formatPaceValue(3601)).toBe("60:01 /km")
    expect(formatPace(0, 300)).toBe("—")
    expect(formatPace(5000, 0)).toBe("—")
    expect(formatPace(Infinity, 300)).toBe("—")
  })

  it("formats dates consistently in UTC", () => {
    expect(formatDate(new Date("2026-03-01T00:01:00Z"))).toBe("Mar 1, 2026")
    expect(formatDate(new Date("invalid"))).toBe("—")
  })
})
