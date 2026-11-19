"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { calculateMilestoneBatch, retryUnavailableMilestones } from "@/lib/milestones";
import { fetchRunDetails } from "@/lib/runs";
import { requireUser } from "@/lib/session";
import { StravaError } from "@/lib/strava";
import { syncRuns } from "@/lib/sync";

export type SyncState = { message: string; error?: boolean };
export type RunDetailState = SyncState & { route?: [number, number][] | null };

async function stravaFailure(error: unknown, fallback: string): Promise<SyncState> {
  if (error instanceof StravaError) {
    if (error.code === "revoked") await signOut({ redirectTo: "/?reason=strava-revoked" });
    if (error.code === "rate-limit") {
      return { message: "Strava rate limit reached. Try again in a few minutes.", error: true };
    }
  }
  return { message: fallback, error: true };
}

export async function syncRunsAction(): Promise<SyncState> {
  const { id } = await requireUser();
  try {
    const { count, more, refreshed, refreshMore } = await syncRuns(id);
    return {
      message: [
        `Imported ${count} ${count === 1 ? "activity" : "activities"} and updated ${refreshed} ${refreshed === 1 ? "name" : "names"}.`,
        ...(more || refreshMore ? ["Sync again to check more activities."] : []),
      ].join(" "),
    };
  } catch (error) {
    return stravaFailure(error, "Couldn’t finish syncing activities. Any saved progress will resume next time.");
  } finally {
    revalidatePath("/dashboard");
    revalidatePath("/runs");
    revalidatePath("/walks");
    revalidatePath("/map");
    revalidatePath("/milestones");
  }
}

export async function loadRunDetailsAction(runId: string): Promise<RunDetailState> {
  const { id } = await requireUser();
  if (!/^[a-z0-9]{1,64}$/.test(runId)) return { message: "Run not found.", error: true };
  try {
    const detail = await fetchRunDetails(id, runId);
    if (!detail) return { message: "Run not found.", error: true };
    revalidatePath(`/runs/${runId}`);
    return { message: "Run details loaded.", route: detail.route };
  } catch (error) {
    return stravaFailure(error, "Couldn’t load run details from Strava. Please try again.");
  }
}

export async function calculateMilestonesAction(): Promise<SyncState> {
  const { id } = await requireUser();
  try {
    const { checked, remaining } = await calculateMilestoneBatch(id);
    return {
      message: `Checked ${checked} ${checked === 1 ? "run" : "runs"}.${remaining ? ` ${remaining} remaining; calculate again to continue.` : " All imported runs checked."}`,
    };
  } catch (error) {
    return stravaFailure(error, "Couldn’t finish calculating milestones. Completed runs were saved; please try again.");
  } finally {
    revalidatePath("/milestones");
  }
}

export async function retryMilestonesAction(): Promise<SyncState> {
  const { id } = await requireUser();
  try {
    const { count } = await retryUnavailableMilestones(id);
    revalidatePath("/milestones");
    return { message: `${count} ${count === 1 ? "run is" : "runs are"} ready to check again.` };
  } catch (error) {
    console.error("Could not reset unavailable milestone runs:", error instanceof Error ? error.name : "UnknownError");
    return { message: "Couldn’t prepare runs for another check. Please try again.", error: true };
  }
}

export async function signOutAction() {
  await requireUser();
  await signOut({ redirectTo: "/" });
}

export async function deleteMyData(formData: FormData) {
  const { id } = await requireUser();
  if (formData.get("confirmation") !== "DELETE") return;
  // Only delete the signed-in user; foreign keys cascade to their runs, splits, accounts and sessions.
  await db.user.deleteMany({ where: { id } });
  await signOut({ redirectTo: "/?reason=deleted" });
}
