import "server-only";
import { db } from "./db";
import { StravaError, stravaFetch } from "./strava";

const PAGE_SIZE = 100;
const PRISMA_INT_MAX = 2_147_483_647;
const STRAVA_ID_MAX = 9_223_372_036_854_775_807n;
const RUN_TYPES = new Set(["Run", "TrailRun"]);

type SummaryActivity = {
  id: number | string;
  name: string;
  type: string;
  sport_type?: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  average_speed: number;
};

function activityId(id: SummaryActivity["id"]) {
  if ((typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
      (typeof id === "string" && /^[1-9]\d{0,18}$/.test(id))) {
    const value = BigInt(id);
    if (value <= STRAVA_ID_MAX) return value;
  }
  throw new StravaError("upstream");
}

export async function syncRuns(userId: string): Promise<{ count: number; more: boolean }> {
  const state = await db.user.findUnique({
    where: { id: userId },
    select: { syncCursor: true, syncBefore: true, syncPage: true, syncNewest: true, syncVersion: true },
  });
  if (!state) throw new StravaError("revoked");

  // Keep the search window fixed while paging. Replay the boundary second for tied timestamps.
  const before = state.syncBefore ?? Math.floor(Date.now() / 1000);
  const activities = await stravaFetch<SummaryActivity[]>(userId, "/athlete/activities", {
    before,
    after: state.syncCursor == null ? undefined : Math.max(0, state.syncCursor - 1),
    page: state.syncPage,
    per_page: PAGE_SIZE,
  });
  if (!Array.isArray(activities)) throw new StravaError("upstream");

  let newest = state.syncNewest ?? state.syncCursor;
  const runs = activities.flatMap((activity) => {
    if (!activity || typeof activity.start_date !== "string") throw new StravaError("upstream");
    const startDate = new Date(activity.start_date);
    const timestamp = Math.floor(startDate.getTime() / 1000);
    if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > PRISMA_INT_MAX) {
      throw new StravaError("upstream");
    }
    // All sports move the cursor, even though only runs are cached.
    newest = newest == null ? timestamp : Math.max(newest, timestamp);
    const type = activity.sport_type ?? activity.type;
    if (!RUN_TYPES.has(type)) return [];

    return [[activityId(activity.id), {
      name: activity.name,
      type,
      startDate,
      distance: activity.distance,
      movingTime: activity.moving_time,
      elapsedTime: activity.elapsed_time,
      elevationGain: activity.total_elevation_gain,
      averageHeartrate: activity.average_heartrate ?? null,
      averageSpeed: activity.average_speed,
    }] as const];
  });
  const more = activities.length >= PAGE_SIZE;

  return db.$transaction(async (tx) => {
    // Claim this exact page without holding a database lock during the Strava request.
    const claim = await tx.user.updateMany({
      where: { id: userId, syncVersion: state.syncVersion },
      data: more ? {
        syncVersion: { increment: 1 },
        syncBefore: before,
        syncPage: state.syncPage + 1,
        syncNewest: newest,
      } : {
        syncVersion: { increment: 1 },
        syncBefore: null,
        syncPage: 1,
        syncNewest: null,
        syncCursor: newest,
        lastSyncedAt: new Date(),
      },
    });
    if (!claim.count) {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { syncBefore: true },
      });
      return { count: 0, more: current?.syncBefore != null };
    }

    if (!runs.length) return { count: 0, more };

    // The per-user claim serializes writers; refresh overlap without counting it as a new run.
    const byId = new Map(runs);
    const existing = await tx.activity.findMany({
      where: { userId, stravaId: { in: [...byId.keys()] } },
      select: { stravaId: true },
    });
    for (const { stravaId } of existing) {
      const summary = byId.get(stravaId);
      if (!summary) continue;
      await tx.activity.update({
        where: { userId_stravaId: { userId, stravaId } },
        data: summary,
      });
      byId.delete(stravaId);
    }
    const count = byId.size ? (await tx.activity.createMany({
      data: [...byId].map(([stravaId, summary]) => ({ userId, stravaId, ...summary })),
      skipDuplicates: true,
    })).count : 0;
    return { count, more };
  }, { timeout: 10_000 });
}
