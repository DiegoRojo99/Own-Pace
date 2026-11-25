import { osmRetrySeconds } from "./osm-response";

export const CITY_PREPARATION_STATUS = "Mapping this city\u2019s tiles\u2026 Keep this page open while it prepares.";

async function pause(milliseconds: number, signal: AbortSignal) {
  signal.throwIfAborted();
  while (milliseconds > 0) {
    const duration = Math.min(milliseconds, 2_147_483_647);
    await new Promise<void>((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", aborted);
        resolve();
      }, duration);
      signal.addEventListener("abort", aborted, { once: true });
    });
    milliseconds -= duration;
    signal.throwIfAborted();
  }
}

/** Wait for shared work and retry transient provider failures without retrying invalid data. */
export async function prepareCityUntilReady(cityId: string, signal: AbortSignal, onStatus: (message: string) => void) {
  let retries = 0;
  while (!signal.aborted) {
    const response = await fetch(`/api/explorer/cities/prepare?cityId=${encodeURIComponent(cityId)}`, {
      method: "POST", signal,
    });
    const data: { done?: boolean; message?: string; error?: string } = await response.json();
    signal.throwIfAborted();
    if (!response.ok) {
      const message = data.error ?? "Could not prepare this city.";
      if (![429, 503].includes(response.status) || retries >= 3) throw new Error(message);
      const seconds = Math.max(5, osmRetrySeconds(response)) * 2 ** retries;
      retries++;
      onStatus(`${message} Retrying in ${seconds} seconds (${retries}/3).`);
      await pause(seconds * 1000, signal);
      continue;
    }
    if (typeof data.done !== "boolean") throw new Error("Could not prepare this city.");
    if (data.done) return;
    if (response.status === 202) {
      const seconds = osmRetrySeconds(response, 5);
      onStatus(`${data.message ?? "Waiting for the shared OpenStreetMap request slot."} Checking again in ${seconds} seconds.`);
      await pause(seconds * 1000, signal);
    } else {
      retries = 0;
      onStatus(CITY_PREPARATION_STATUS);
      await pause(150, signal);
    }
  }
  signal.throwIfAborted();
}
