export const milestoneDistances = [
  { key: "1km", label: "1 km", meters: 1_000 },
  { key: "2km", label: "2 km", meters: 2_000 },
  { key: "3km", label: "3 km", meters: 3_000 },
  { key: "5km", label: "5 km", meters: 5_000 },
  { key: "8km", label: "8 km", meters: 8_000 },
  { key: "10km", label: "10 km", meters: 10_000 },
  { key: "15km", label: "15 km", meters: 15_000 },
  { key: "half-marathon", label: "Half marathon", meters: 21_097.5 },
  { key: "marathon", label: "Marathon", meters: 42_195 },
] as const;

type BestEffort = { distance: number; moving_time?: number | null; elapsed_time?: number | null };
type Result = { distanceKey: string; duration: number; timeBasis: "MOVING" | "ELAPSED" };

export function calculateStravaMilestones(efforts: readonly BestEffort[]): Result[] {
  const best = new Map<string, Result>();
  for (const effort of efforts) {
    if (!effort || !Number.isFinite(effort.distance) || effort.distance <= 0) throw new Error("Invalid best effort");
    // Strava may round the standard race distance to a whole meter.
    const target = milestoneDistances.find(({ meters }) => Math.abs(effort.distance - meters) <= 0.5);
    if (!target) continue;
    if ((effort.moving_time != null && (!Number.isFinite(effort.moving_time) || effort.moving_time < 0)) ||
      (effort.elapsed_time != null && (!Number.isFinite(effort.elapsed_time) || effort.elapsed_time < 0))) {
      throw new Error("Invalid best-effort time");
    }
    const moving = effort.moving_time && effort.moving_time > 0 ? effort.moving_time : null;
    const duration = moving ?? effort.elapsed_time;
    if (!duration) continue;
    const existing = best.get(target.key);
    if (!existing || duration < existing.duration) {
      best.set(target.key, { distanceKey: target.key, duration, timeBasis: moving ? "MOVING" : "ELAPSED" });
    }
  }
  return [...best.values()];
}

type Split = { index: number; distance: number; movingTime: number; elapsedTime: number };

const MAX_SPLIT_DISTANCE_RATIO = 1.005;

export function calculateSplitMilestones(splits: readonly Split[]) {
  const best = new Map<string, { distanceKey: string; duration: number; timeBasis: "MOVING" | "ELAPSED" }>();
  const maxDistance = milestoneDistances[milestoneDistances.length - 1].meters;

  for (let start = 0; start < splits.length; start++) {
    let distance = 0;
    let movingTime = 0;
    let elapsedTime = 0;
    let hasMovingTime = true;
    let hasElapsedTime = true;
    for (let end = start; end < splits.length; end++) {
      const split = splits[end];
      if (!Number.isFinite(split.distance) || split.distance <= 0 ||
        !Number.isFinite(split.elapsedTime) || split.elapsedTime < 0 ||
        !Number.isFinite(split.movingTime) || split.movingTime < 0 ||
        !Number.isInteger(split.index) || split.index <= 0) {
        throw new Error("Invalid split");
      }
      if (end > start && split.index !== splits[end - 1].index + 1) break;
      distance += split.distance;
      elapsedTime += split.elapsedTime;
      movingTime += split.movingTime;
      hasMovingTime &&= split.movingTime > 0;
      hasElapsedTime &&= split.elapsedTime > 0;
      if (distance > maxDistance * MAX_SPLIT_DISTANCE_RATIO + 1e-6) break;
      for (const target of milestoneDistances) {
        if (distance < target.meters - 1e-6 || distance > target.meters * MAX_SPLIT_DISTANCE_RATIO + 1e-6) continue;
        if (!hasMovingTime && !hasElapsedTime) continue;
        const duration = hasMovingTime ? movingTime : elapsedTime;
        const existing = best.get(target.key);
        if (!existing || duration < existing.duration) {
          best.set(target.key, { distanceKey: target.key, duration, timeBasis: hasMovingTime ? "MOVING" : "ELAPSED" });
        }
      }
    }
  }
  return [...best.values()];
}
