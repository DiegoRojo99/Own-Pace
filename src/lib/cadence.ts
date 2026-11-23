import "server-only";
import { runTypes } from "./activity-types";
import { CADENCE_ANALYSIS_VERSION, calculateCadenceDurations, type CadenceAnalysis } from "./cadence-calculation";
import { db } from "./db";
import { StravaError, stravaFetch, stravaIdToPath } from "./strava";

export async function calculateCadenceBatch(userId: string) {
  const runs = { userId, type: { in: runTypes } };
  const pending = { ...runs, OR: [{ cadenceChecked: false }, { cadenceVersion: { lt: CADENCE_ANALYSIS_VERSION } }] };
  const activities = await db.activity.findMany({
    where: pending,
    select: { id: true, stravaId: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: 5,
  });
  let checked = 0;
  for (const activity of activities) {
    let durations: CadenceAnalysis | null = null;
    try {
      const streams = await stravaFetch<unknown>(
        userId, `/activities/${stravaIdToPath(activity.stravaId)}/streams`,
        { keys: "time,cadence,moving,velocity_smooth,distance", key_by_type: true, resolution: "high" },
      );
      try {
        durations = calculateCadenceDurations(streams);
      } catch {
        throw new StravaError("upstream");
      }
    } catch (error) {
      if (!(error instanceof StravaError && error.code === "not-found")) throw error;
    }
    const claim = await db.activity.updateMany({
      where: { id: activity.id, ...pending },
      data: {
        cadenceChecked: true,
        cadenceVersion: CADENCE_ANALYSIS_VERSION,
        cadenceSource: durations?.source ?? null,
        runningTime: durations?.runningTime ?? null,
        walkingTime: durations?.walkingTime ?? null,
        firstRunningTime: durations?.firstRunningTime ?? null,
        lastRunningTime: durations?.lastRunningTime ?? null,
      },
    });
    checked += claim.count;
  }
  const remaining = await db.activity.count({ where: pending });
  return { checked, remaining };
}

export function retryUnavailableCadence(userId: string) {
  return db.activity.updateMany({
    where: { userId, type: { in: runTypes }, cadenceChecked: true, runningTime: null },
    data: { cadenceChecked: false },
  });
}
