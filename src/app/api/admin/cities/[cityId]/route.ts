import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { parseBoundaryInput, updateCityBoundary } from "@/lib/city-boundary";

const MAX_BYTES = 5_000_000;

export async function PUT(request: Request, { params }: { params: Promise<{ cityId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await isAdmin(session.user.id))) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { cityId } = await params;
  if (!/^[a-z0-9]{1,64}$/.test(cityId)) return Response.json({ error: "Invalid city" }, { status: 400 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Boundary is too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const boundary = parseBoundaryInput(body);
  if (!boundary) return Response.json({ error: "Boundary must be a closed GeoJSON Polygon or MultiPolygon in [longitude, latitude] order." }, { status: 400 });
  if (!(await updateCityBoundary(cityId, boundary))) return Response.json({ error: "City not found" }, { status: 404 });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
