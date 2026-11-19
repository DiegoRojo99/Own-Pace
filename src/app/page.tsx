import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; error?: string }>;
}) {
  if ((await auth())?.user?.id) redirect("/dashboard");
  const { reason, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-5 py-12">
      <Card className="w-full">
        <CardContent className="space-y-6 p-6 sm:p-10">
          <p className="text-sm font-semibold tracking-widest text-primary uppercase">Own Pace</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Your runs, at your own pace.
          </h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            See your weekly mileage, compare months, and revisit your kilometre splits.
            Only you can see the runs you sync.
          </p>
          {reason === "strava-revoked" && (
            <p role="status">Strava access is no longer available. Sign in again to reconnect.</p>
          )}
          {reason === "deleted" && <p role="status">Your Own Pace data has been deleted.</p>}
          {error && <p role="alert">Couldn’t sign in with Strava. Please try again.</p>}
          <form
            action={async () => {
              "use server";
              await signIn("strava", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit">Sign in with Strava</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
