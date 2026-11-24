import { auth } from "@/auth";
import { CityLookupError, searchCities, selectCity } from "@/lib/city-lookup";

export const maxDuration = 20;

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new CityLookupError("invalid");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4096) { await reader.cancel(); throw new CityLookupError("invalid"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new CityLookupError("invalid"); }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await readBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new CityLookupError("invalid");
    if ("action" in body && body.action === "search" && "query" in body && typeof body.query === "string") {
      return Response.json({ results: await searchCities(body.query) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if ("action" in body && body.action === "select" && "osmType" in body &&
        (body.osmType === "WAY" || body.osmType === "RELATION") && "osmId" in body && typeof body.osmId === "string") {
      return Response.json({ city: await selectCity(body.osmType, body.osmId) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    throw new CityLookupError("invalid");
  } catch (error) {
    if (error instanceof CityLookupError) {
      const messages = {
        invalid: "Enter a city name between 2 and 100 characters.",
        "rate-limit": "City lookup is busy or rate-limited. Please wait and try again.",
        upstream: "City lookup is unavailable. Please try again later.",
        "no-boundary": "This place does not have a usable administrative boundary. Try another result.",
      };
      const status = error.code === "invalid" ? 400 : error.code === "rate-limit" ? 429 : error.code === "no-boundary" ? 422 : 502;
      return Response.json({ error: messages[error.code] }, { status, headers: { "Cache-Control": "private, no-store" } });
    }
    console.error("City lookup failed:", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "City lookup failed. Please try again later." }, { status: 500 });
  }
}
