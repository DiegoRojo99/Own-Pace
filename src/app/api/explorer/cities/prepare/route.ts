import { auth } from "@/auth";
import { prepareCityTiles } from "@/lib/city-progress";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const cityId = new URL(request.url).searchParams.get("cityId");
  if (!cityId || !/^[a-z0-9]{1,64}$/.test(cityId)) return Response.json({ error: "Invalid city" }, { status: 400 });
  try {
    const result = await prepareCityTiles(session.user.id, cityId);
    if (!result) return Response.json({ error: "City not found" }, { status: 404 });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Could not prepare city tiles:", error instanceof Error ? error.message : "UnknownError");
    return Response.json({ error: "Could not prepare this city. Please try again." }, { status: 500 });
  }
}
