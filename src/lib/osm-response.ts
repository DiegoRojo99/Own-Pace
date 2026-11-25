export const OSM_USER_AGENT = "OwnPace/0.2 (https://github.com/DiegoRojo99/Own-Pace)";

export function osmRetrySeconds(response: Pick<Response, "headers">, fallback = 60) {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return fallback;
  const seconds = /^\d+$/.test(value) ? Number(value) : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : fallback;
}

export async function osmResponseText(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing OSM response body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("OSM response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
