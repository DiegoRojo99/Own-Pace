export const RUNNING_CADENCE = 135;
export const RUNNING_PACE_SECONDS = 9 * 60;
export const BOUT_GAP_SECONDS = 15;
export const MIN_BOUT_SECONDS = 30;
export const CADENCE_ANALYSIS_VERSION = 1;
export type RunWalkSource = "CADENCE" | "SPEED";

export type CadenceDurations = {
  runningTime: number;
  walkingTime: number;
  firstRunningTime: number;
  lastRunningTime: number;
};

type Stream = { data: unknown[] };

export type CadenceAnalysis = CadenceDurations & { source: RunWalkSource };

function stream(value: unknown): Stream | null {
  if (value == null) return null;
  if (typeof value !== "object" || !("data" in value) || !Array.isArray(value.data)) {
    throw new Error("Invalid cadence stream");
  }
  return { data: value.data };
}

function numbers(value: Stream, length: number): number[] {
  if (value.data.length !== length) throw new Error("Misaligned activity streams");
  return value.data.map((sample) => {
    if (typeof sample !== "number" || !Number.isFinite(sample) || sample < 0) {
      throw new Error("Invalid activity sample");
    }
    return sample;
  });
}

export function calculateCadenceDurations(payload: unknown): CadenceAnalysis | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid cadence streams");
  }
  const time = stream("time" in payload ? payload.time : null);
  const moving = stream("moving" in payload ? payload.moving : null);
  const cadenceStream = stream("cadence" in payload ? payload.cadence : null);
  if (!time || !moving) return null;
  const seconds = numbers(time, time.data.length);
  const cadence = cadenceStream ? numbers(cadenceStream, seconds.length) : null;
  const speedStream = cadence ? null : stream("velocity_smooth" in payload ? payload.velocity_smooth : null);
  const speed = speedStream ? numbers(speedStream, seconds.length) : null;
  const distanceStream = cadence || speed ? null : stream("distance" in payload ? payload.distance : null);
  const distance = distanceStream ? numbers(distanceStream, seconds.length) : null;
  if (!cadence && !speed && !distance) return null;
  if (moving.data.length !== seconds.length) throw new Error("Misaligned activity streams");
  for (let index = 0; index < seconds.length; index++) {
    if ((index > 0 && seconds[index] <= seconds[index - 1]) || typeof moving.data[index] !== "boolean" ||
      (distance && index > 0 && distance[index] < distance[index - 1])) {
      throw new Error("Invalid activity sample");
    }
  }
  if (seconds.length < 2) return null;

  let runningTime = 0;
  let walkingTime = 0;
  let bout = 0;
  let gap = 0;
  let firstRunningTime = 0;
  let lastRunningTime = 0;
  const finishBout = () => {
    if (bout >= MIN_BOUT_SECONDS) {
      if (firstRunningTime === 0) firstRunningTime = bout;
      lastRunningTime = bout;
    }
    bout = 0;
    gap = 0;
  };
  // Each sample describes the interval until the next; do not invent a final interval.
  for (let index = 0; index < seconds.length - 1; index++) {
    const duration = seconds[index + 1] - seconds[index];
    // Strava's running cadence is strides/minute, so double it for total steps/minute.
    const aboveThreshold = cadence
      ? cadence[index] * 2 >= RUNNING_CADENCE
      : speed
        ? speed[index] >= 1000 / RUNNING_PACE_SECONDS
        : distance !== null && (distance[index + 1] - distance[index]) / duration >= 1000 / RUNNING_PACE_SECONDS;
    if (moving.data[index] && aboveThreshold) {
      runningTime += duration;
      bout += duration;
      gap = 0;
    } else {
      if (moving.data[index]) walkingTime += duration;
      gap += duration;
      if (gap > BOUT_GAP_SECONDS) finishBout();
    }
  }
  finishBout();
  return { runningTime, walkingTime, firstRunningTime, lastRunningTime, source: cadence ? "CADENCE" : "SPEED" };
}
