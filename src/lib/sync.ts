import "server-only";
import { runTypes, walkType } from "./activity-types";
import { db } from "./db";
import { StravaError, stravaFetch } from "./strava";

const PAGE_SIZE = 100;
const PRISMA_INT_MAX = 2_147_483_647;
const STRAVA_ID_MAX = 9_223_372_036_854_775_807n;
const importedTypes = new Set([...runTypes, walkType]);

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

function activityStart(activity: SummaryActivity) {
  if (!activity || typeof activity.name !== "string" || typeof activity.start_date !== "string") {
    throw new StravaError("upstream");
  }
  const startDate = new Date(activity.start_date);
  const timestamp = Math.floor(startDate.getTime() / 1000);
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > PRISMA_INT_MAX) {
    throw new StravaError("upstream");
  }
  return { startDate, timestamp };
}

function activitySummary(activity: SummaryActivity, type: string, startDate: Date) {
  return {
    name: activity.name,
    type,
    startDate,
    distance: activity.distance,
    movingTime: activity.moving_time,
    elapsedTime: activity.elapsed_time,
    elevationGain: activity.total_elevation_gain,
    averageHeartrate: activity.average_heartrate ?? null,
    averageSpeed: activity.average_speed,
  };
}

export async function syncRuns(userId: string): Promise<{ count: number; more: boolean; refreshed: number; refreshMore: boolean }> {
  const state = await db.user.findUnique({
    where: { id: userId },
    select: {
      syncCursor: true,
      syncBefore: true,
      syncPage: true,
      syncNewest: true,
      activityRefreshBefore: true,
      activityRefreshPage: true,
      syncVersion: true,
    },
  });
  if (!state) throw new StravaError("revoked");

  // Keep the search window fixed while paging. Replay the boundary second for tied timestamps.
  const now = Math.floor(Date.now() / 1000);
  const before = state.syncBefore ?? now;
  const activities = await stravaFetch<SummaryActivity[]>(userId, "/athlete/activities", {
    before,
    after: state.syncCursor == null ? undefined : Math.max(0, state.syncCursor - 1),
    page: state.syncPage,
    per_page: PAGE_SIZE,
  });
  if (!Array.isArray(activities)) throw new StravaError("upstream");

  const activityRefreshBefore = state.activityRefreshBefore ?? now;
  const activityRefreshPage = state.activityRefreshBefore == null ? 1 : state.activityRefreshPage;
  const samePage = state.syncCursor == null && before === activityRefreshBefore && state.syncPage === activityRefreshPage;
  const refreshActivities = samePage
    ? activities
    : await stravaFetch<SummaryActivity[]>(userId, "/athlete/activities", {
      before: activityRefreshBefore,
      page: activityRefreshPage,
      per_page: PAGE_SIZE,
    });
  if (!Array.isArray(refreshActivities)) throw new StravaError("upstream");

  let newest = state.syncNewest ?? state.syncCursor;
  const summaries = activities.flatMap((activity) => {
    const { startDate, timestamp } = activityStart(activity);
    // All sports move the cursor, even though only runs and walks are cached.
    newest = newest == null ? timestamp : Math.max(newest, timestamp);
    const type = activity.sport_type ?? activity.type;
    if (!importedTypes.has(type)) return [];
    return [[activityId(activity.id), activitySummary(activity, type, startDate)] as const];
  });
  const more = activities.length >= PAGE_SIZE;
  const currentIds = new Set(summaries.map(([stravaId]) => stravaId));
  const olderActivities = new Map((samePage ? [] : refreshActivities).flatMap((activity) => {
    if (!activity || typeof activity.name !== "string") throw new StravaError("upstream");
    const type = activity.sport_type ?? activity.type;
    if (!importedTypes.has(type)) return [];
    const stravaId = activityId(activity.id);
    return currentIds.has(stravaId) ? [] : [[stravaId, { activity, type }] as const];
  }));
  const refreshMore = refreshActivities.length >= PAGE_SIZE;

  return db.$transaction(async (tx) => {
    // Claim this exact page without holding a database lock during the Strava request.
    const claim = await tx.user.updateMany({
      where: { id: userId, syncVersion: state.syncVersion },
      data: more ? {
        syncVersion: { increment: 1 },
        syncBefore: before,
        syncPage: state.syncPage + 1,
        syncNewest: newest,
        activityRefreshBefore: refreshMore ? activityRefreshBefore : null,
        activityRefreshPage: refreshMore ? activityRefreshPage + 1 : 1,
      } : {
        syncVersion: { increment: 1 },
        syncBefore: null,
        syncPage: 1,
        syncNewest: null,
        syncCursor: newest,
        lastSyncedAt: new Date(),
        activityRefreshBefore: refreshMore ? activityRefreshBefore : null,
        activityRefreshPage: refreshMore ? activityRefreshPage + 1 : 1,
      },
    });
    if (!claim.count) {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { syncBefore: true, activityRefreshBefore: true },
      });
      return {
        count: 0,
        more: current?.syncBefore != null,
        refreshed: 0,
        refreshMore: current?.activityRefreshBefore != null,
      };
    }

    // The per-user claim serializes writers; replayed activities refresh cached summaries without counting as new.
    const byId = new Map(summaries);
    let refreshed = 0;
    const existing = byId.size ? await tx.activity.findMany({
      where: { userId, stravaId: { in: [...byId.keys()] } },
      select: { stravaId: true, name: true },
    }) : [];
    for (const { stravaId, name: existingName } of existing) {
      const summary = byId.get(stravaId);
      if (!summary) continue;
      if (existingName !== summary.name) refreshed++;
      await tx.activity.update({
        where: { userId_stravaId: { userId, stravaId } },
        data: summary,
      });
      byId.delete(stravaId);
    }
    if (olderActivities.size) {
      const historicalRows = await tx.activity.findMany({
        where: { userId, stravaId: { in: [...olderActivities.keys()] } },
        select: { stravaId: true, name: true },
      });
      for (const existing of historicalRows) {
        const name = olderActivities.get(existing.stravaId)?.activity.name;
        olderActivities.delete(existing.stravaId);
        if (name === undefined || name === existing.name) continue;
        await tx.activity.update({
          where: { userId_stravaId: { userId, stravaId: existing.stravaId } },
          data: { name },
        });
        refreshed++;
      }
      // Older walks may have been skipped before the app supported them.
      for (const [stravaId, { activity, type }] of olderActivities) {
        if (type !== walkType) continue;
        byId.set(stravaId, activitySummary(activity, type, activityStart(activity).startDate));
      }
    }
    const count = byId.size ? (await tx.activity.createMany({
      data: [...byId].map(([stravaId, summary]) => ({ userId, stravaId, ...summary })),
      skipDuplicates: true,
    })).count : 0;
    return { count, more, refreshed, refreshMore };
  }, { timeout: 10_000 });
}
