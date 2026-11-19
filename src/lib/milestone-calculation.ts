export const milestoneDistances = [
  { key: "1km", label: "1 km", meters: 1_000 },
  { key: "2km", label: "2 km", meters: 2_000 },
  { key: "5km", label: "5 km", meters: 5_000 },
  { key: "5mi", label: "5 miles", meters: 8_046.72 },
  { key: "10km", label: "10 km", meters: 10_000 },
  { key: "half-marathon", label: "Half marathon", meters: 21_097.5 },
  { key: "marathon", label: "Marathon", meters: 42_195 },
] as const;

type Sample = { distance: number; firstTime: number; lastTime: number };

export function calculateMilestones(distances: readonly number[], times: readonly number[]) {
  if (distances.length !== times.length) throw new Error("Stream lengths differ");
  const samples: Sample[] = [];

  for (let i = 0; i < distances.length; i++) {
    const distance = distances[i];
    const time = times[i];
    const previous = samples[samples.length - 1];
    if (!Number.isFinite(distance) || !Number.isFinite(time) || distance < 0 || time < 0 ||
      (previous && (distance < previous.distance || time < previous.lastTime))) {
      throw new Error("Invalid distance or time stream");
    }
    if (previous && distance === previous.distance) previous.lastTime = time;
    else samples.push({ distance, firstTime: time, lastTime: time });
  }
  if (samples.length < 2) return [];

  function timeAt(distance: number, endpoint: "start" | "end") {
    let low = 0;
    let high = samples.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle].distance < distance) low = middle + 1;
      else high = middle;
    }
    const sample = samples[low];
    if (sample.distance === distance) return endpoint === "start" ? sample.lastTime : sample.firstTime;
    const previous = samples[low - 1];
    const fraction = (distance - previous.distance) / (sample.distance - previous.distance);
    return previous.lastTime + fraction * (sample.firstTime - previous.lastTime);
  }

  const first = samples[0].distance;
  const last = samples[samples.length - 1].distance;
  return milestoneDistances.flatMap(({ key, meters }) => {
    if (last - first < meters) return [];
    let best = Infinity;
    for (const sample of samples) {
      if (sample.distance + meters <= last) {
        const duration = timeAt(sample.distance + meters, "end") - sample.lastTime;
        if (duration > 0) best = Math.min(best, duration);
      }
      if (sample.distance - meters >= first) {
        const duration = sample.firstTime - timeAt(sample.distance - meters, "start");
        if (duration > 0) best = Math.min(best, duration);
      }
    }
    return Number.isFinite(best) ? [{ distanceKey: key, elapsedTime: best }] : [];
  });
}
