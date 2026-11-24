import { auth } from "@/auth";
import { db } from "@/lib/db";
import { TILE_ZOOM } from "@/lib/tiles";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Only return the signed-in user's tiles.
  const tiles = await db.userTile.findMany({
    where: { userId: session.user.id, zoom: TILE_ZOOM },
    select: { x: true, y: true },
  });
  return Response.json({ zoom: TILE_ZOOM, tiles: tiles.map(({ x, y }) => [x, y]) }, { headers: { "Cache-Control": "private, no-store" } });
}
