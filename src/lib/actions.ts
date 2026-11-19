"use server";

import { revalidatePath } from "next/cache";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
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
    const { count, more } = await syncRuns(id);
    return {
      message: `Synced ${count} ${count === 1 ? "run" : "runs"}.${more ? " More activities are available; sync again to continue." : ""}`,
    };
  } catch (error) {
    return stravaFailure(error, "Couldn’t finish syncing runs. Any saved progress will resume next time.");
  } finally {
    revalidatePath("/dashboard");
    revalidatePath("/runs");
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
