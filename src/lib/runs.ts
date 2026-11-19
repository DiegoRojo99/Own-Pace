import "server-only";
import { db } from "./db";
import { StravaError, stravaFetch, stravaIdToPath } from "./strava";

type MetricSplit = {
  split: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_difference: number;
  average_speed: number;
  average_heartrate?: number;
};

export function getRuns(userId: string) {
  return db.activity.findMany({
    where: { userId },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
  });
}

export function getRun(userId: string, id: string) {
  // The URL supplies an ID, not authorization to read it.
  return db.activity.findUnique({
    where: { id, userId },
    include: { splits: { orderBy: { index: "asc" } } },
  });
}

export async function fetchRunSplits(userId: string, id: string): Promise<boolean> {
  const where = { id, userId };
  // Resolve the upstream activity only after checking local ownership.
  const run = await db.activity.findUnique({
    where,
    select: { stravaId: true, detailFetched: true },
  });
  if (!run) return false;
  if (run.detailFetched) return true;

  const detail = await stravaFetch<{ splits_metric?: MetricSplit[] | null }>(
    userId, `/activities/${stravaIdToPath(run.stravaId)}`,
  );
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) throw new StravaError("upstream");
  const metric = detail.splits_metric ?? [];
  if (!Array.isArray(metric)) throw new StravaError("upstream");

  const data = metric.map((split) => ({
    activityId: id,
    index: split.split,
    distance: split.distance,
    movingTime: split.moving_time,
    elapsedTime: split.elapsed_time,
    elevationDifference: split.elevation_difference,
    averageSpeed: split.average_speed,
    averageHeartrate: split.average_heartrate ?? null,
  }));
  return db.$transaction(async (tx) => {
    // Claim and write atomically, including when there are no metric splits to cache.
    const claim = await tx.activity.updateMany({
      where: { ...where, detailFetched: false },
      data: { detailFetched: true },
    });
    if (!claim.count) {
      return Boolean(await tx.activity.findUnique({ where, select: { id: true } }));
    }
    if (data.length) await tx.split.createMany({ data });
    return true;
  });
}
