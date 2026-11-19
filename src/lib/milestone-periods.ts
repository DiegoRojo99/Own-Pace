import { milestoneDistances } from "./milestone-calculation";

export type MilestoneEffort = {
  distanceKey: string;
  elapsedTime: number;
  activity: { id: string; name: string; startDate: Date };
};

export const milestonePeriods = [
  { key: "allTime", label: "All time" },
  { key: "lastYear", label: "Last 12 months" },
  { key: "last90Days", label: "Last 90 days" },
  { key: "yearToDate", label: "Year to date" },
] as const;

export function milestoneRecords(efforts: readonly MilestoneEffort[], now: Date | null) {
  let cutoffs: { lastYear: number; last90Days: number; yearToDate: number } | null = null;
  if (now) {
    const lastYear = new Date(now);
    const day = lastYear.getUTCDate();
    lastYear.setUTCDate(1);
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
    const lastDay = new Date(Date.UTC(lastYear.getUTCFullYear(), lastYear.getUTCMonth() + 1, 0)).getUTCDate();
    lastYear.setUTCDate(Math.min(day, lastDay));

    cutoffs = {
      lastYear: lastYear.getTime(),
      last90Days: now.getTime() - 90 * 24 * 60 * 60 * 1000,
      yearToDate: Date.UTC(now.getUTCFullYear(), 0, 1),
    };
  }

  return milestoneDistances.map((distance) => {
    const matching = efforts.filter((effort) => effort.distanceKey === distance.key);
    return {
      ...distance,
      periods: milestonePeriods.map((period) => ({
        ...period,
        loading: period.key !== "allTime" && !cutoffs,
        effort: matching.find((effort) => {
          if (period.key === "allTime") return true;
          if (!cutoffs || !now) return false;
          const date = effort.activity.startDate.getTime();
          return date >= cutoffs[period.key] && date <= now.getTime();
        }) ?? null,
      })),
    };
  });
}
