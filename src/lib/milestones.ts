import "server-only";
import { db } from "./db";
import { calculateStravaMilestones, calculateSplitMilestones, milestoneDistances } from "./milestone-calculation";
import { StravaError, stravaFetch, stravaIdToPath } from "./strava";

const BATCH_SIZE = 5;

type ActivityDetail = {
  best_efforts?: Parameters<typeof calculateStravaMilestones>[0] | null;
  splits_metric?: { split: number; distance: number; moving_time?: number | null; elapsed_time?: number | null }[] | null;
};

type Split = { index: number; distance: number; movingTime: number; elapsedTime: number };
type Activity = { id: string; stravaId: bigint; distance: number; splits: Split[] };
type Effort = { distanceKey: string; duration: number; timeBasis: "MOVING" | "ELAPSED"; source: "STRAVA" | "SPLITS" };

async function getEfforts(userId: string, activity: Activity): Promise<{ efforts: Effort[]; unavailable: boolean }> {
  let detail: ActivityDetail | null;
  try {
    detail = await stravaFetch<ActivityDetail>(userId, `/activities/${stravaIdToPath(activity.stravaId)}`);
    if (!detail || typeof detail !== "object" || Array.isArray(detail)) throw new StravaError("upstream");
  } catch (error) {
    if (!(error instanceof StravaError && error.code === "not-found")) throw error;
    detail = null;
  }

  try {
    if ((detail?.best_efforts != null && !Array.isArray(detail.best_efforts)) ||
      (detail?.splits_metric != null && !Array.isArray(detail.splits_metric))) {
      throw new Error("Invalid activity details");
    }

    const efforts: Effort[] = calculateStravaMilestones(detail?.best_efforts ?? [])
      .map((effort) => ({ ...effort, source: "STRAVA" }));
    let splits = activity.splits;
    if (detail?.splits_metric?.length) {
      splits = detail.splits_metric.map((split) => {
        if (!split || (split.moving_time != null && typeof split.moving_time !== "number") ||
          (split.elapsed_time != null && typeof split.elapsed_time !== "number")) {
          throw new Error("Invalid activity split");
        }
        return {
          index: split.split,
          distance: split.distance,
          movingTime: split.moving_time ?? 0,
          elapsedTime: split.elapsed_time ?? 0,
        };
      }).sort((a, b) => a.index - b.index);
    }
    for (const effort of calculateSplitMilestones(splits)) {
      if (!efforts.some((item) => item.distanceKey === effort.distanceKey)) {
        efforts.push({ ...effort, source: "SPLITS" });
      }
    }
    const missing = milestoneDistances.some((target) =>
      activity.distance >= target.meters && !efforts.some((effort) => effort.distanceKey === target.key));
    return { efforts, unavailable: !detail || missing };
  } catch {
    throw new StravaError("upstream");
  }
}

export async function calculateMilestoneBatch(userId: string) {
  const activities = await db.activity.findMany({
    where: { userId, milestoneChecked: false },
    select: {
      id: true, stravaId: true, distance: true,
      splits: { orderBy: { index: "asc" }, select: { index: true, distance: true, movingTime: true, elapsedTime: true } },
    },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: BATCH_SIZE,
  });
  let checked = 0;
  for (const activity of activities) {
    const { efforts, unavailable } = await getEfforts(userId, activity);
    const claimed = await db.$transaction(async (tx) => {
      const claim = await tx.activity.updateMany({
        where: { id: activity.id, userId, milestoneChecked: false },
        data: { milestoneChecked: true, milestoneUnavailable: unavailable },
      });
      if (!claim.count) return false;
      await tx.milestoneEffort.deleteMany({ where: { activityId: activity.id } });
      if (efforts.length) {
        await tx.milestoneEffort.createMany({
          data: efforts.map((effort) => ({ ...effort, activityId: activity.id })),
        });
      }
      return true;
    });
    if (claimed) checked++;
  }
  const remaining = await db.activity.count({ where: { userId, milestoneChecked: false } });
  return { checked, remaining };
}

export async function getMilestones(userId: string) {
  const [efforts, pending, unavailable, total] = await Promise.all([
    db.milestoneEffort.findMany({
      where: { activity: { userId } },
      select: {
        distanceKey: true,
        duration: true,
        timeBasis: true,
        source: true,
        activity: { select: { id: true, name: true, startDate: true } },
      },
      orderBy: [{ duration: "asc" }, { activity: { startDate: "desc" } }, { activityId: "asc" }],
    }),
    db.activity.count({ where: { userId, milestoneChecked: false } }),
    db.activity.count({ where: { userId, milestoneChecked: true, milestoneUnavailable: true } }),
    db.activity.count({ where: { userId } }),
  ]);
  return {
    pending,
    unavailable,
    total,
    efforts,
  };
}

export async function retryUnavailableMilestones(userId: string) {
  return db.activity.updateMany({
    where: { userId, milestoneChecked: true, milestoneUnavailable: true },
    data: { milestoneChecked: false, milestoneUnavailable: false },
  });
}
