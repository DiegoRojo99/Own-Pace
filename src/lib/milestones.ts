import "server-only";
import { db } from "./db";
import { calculateMilestones, milestoneDistances } from "./milestone-calculation";
import { StravaError, stravaFetch, stravaIdToPath } from "./strava";

const BATCH_SIZE = 5;

type StreamSet = {
  distance?: { data?: unknown } | null;
  time?: { data?: unknown } | null;
};

async function getEfforts(userId: string, stravaId: bigint) {
  let streams: StreamSet | [];
  try {
    streams = await stravaFetch<StreamSet | []>(userId, `/activities/${stravaIdToPath(stravaId)}/streams`, {
      keys: "distance,time",
      key_by_type: true,
    });
  } catch (error) {
    if (error instanceof StravaError && error.code === "not-found") return null;
    throw error;
  }
  if (Array.isArray(streams) && streams.length === 0) return null;
  if (!streams || typeof streams !== "object" || Array.isArray(streams)) throw new StravaError("upstream");
  if (!streams.distance || !streams.time) return null;
  const distances = streams.distance.data;
  const times = streams.time.data;
  if (!Array.isArray(distances) || !Array.isArray(times)) throw new StravaError("upstream");
  if (distances.length === times.length && distances.length < 2) return null;
  try {
    return calculateMilestones(distances, times);
  } catch {
    throw new StravaError("upstream");
  }
}

export async function calculateMilestoneBatch(userId: string) {
  const activities = await db.activity.findMany({
    where: { userId, milestoneChecked: false },
    select: { id: true, stravaId: true },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: BATCH_SIZE,
  });
  let checked = 0;
  for (const activity of activities) {
    const efforts = await getEfforts(userId, activity.stravaId);
    const claimed = await db.$transaction(async (tx) => {
      const claim = await tx.activity.updateMany({
        where: { id: activity.id, userId, milestoneChecked: false },
        data: { milestoneChecked: true, milestoneUnavailable: efforts === null },
      });
      if (!claim.count) return false;
      if (efforts?.length) {
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
        elapsedTime: true,
        activity: { select: { id: true, name: true, startDate: true } },
      },
      orderBy: [{ elapsedTime: "asc" }, { activity: { startDate: "desc" } }, { activityId: "asc" }],
    }),
    db.activity.count({ where: { userId, milestoneChecked: false } }),
    db.activity.count({ where: { userId, milestoneChecked: true, milestoneUnavailable: true } }),
    db.activity.count({ where: { userId } }),
  ]);
  return {
    pending,
    unavailable,
    total,
    records: milestoneDistances.map((distance) => ({
      ...distance,
      effort: efforts.find((effort) => effort.distanceKey === distance.key) ?? null,
    })),
  };
}

export async function retryUnavailableMilestones(userId: string) {
  return db.activity.updateMany({
    where: { userId, milestoneChecked: true, milestoneUnavailable: true },
    data: { milestoneChecked: false, milestoneUnavailable: false },
  });
}
