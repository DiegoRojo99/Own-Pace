import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { processPendingActivities, resetExplorer } from "@/lib/explorer";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const action = new URL(request.url).searchParams.get("action");
  if (action !== null && action !== "reset") return Response.json({ error: "Invalid action" }, { status: 400 });
  try {
    // Both operations are scoped to the signed-in user.
    if (action === "reset") await resetExplorer(session.user.id);
    const progress = await processPendingActivities(session.user.id, 50);
    revalidatePath("/explorer");
    revalidatePath("/map");
    return Response.json(progress, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Explorer processing failed:", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "Could not process activities. Completed work was saved; try again." }, { status: 500 });
  }
}
