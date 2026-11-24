import "server-only";
import { notFound } from "next/navigation";
import { db } from "./db";
import { requireUser } from "./session";

/** Admins are Strava athlete IDs listed in the comma-separated ADMIN_STRAVA_ATHLETE_IDS variable. */
export async function isAdmin(userId: string) {
  const ids = (process.env.ADMIN_STRAVA_ATHLETE_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { stravaAthleteId: true } });
  return !!user && ids.includes(String(user.stravaAthleteId));
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!(await isAdmin(user.id))) notFound();
  return user;
}
