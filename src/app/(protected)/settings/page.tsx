import { DeleteDataForm } from "@/components/delete-data-form"
import { PageHeading } from "@/components/page-heading"
import { SyncRunsForm } from "@/components/sync-runs-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { signOutAction } from "@/lib/actions"
import { requireUser } from "@/lib/session"

export default async function SettingsPage() {
  const user = await requireUser()

  return (
    <div className="space-y-7">
      <PageHeading eyebrow="Preferences" title="Settings" description="Manage your Strava connection and the data Own Pace stores." />
      <Card>
        <CardHeader>
          <CardTitle>Strava account</CardTitle>
          <CardDescription>{user.name ? `Signed in as ${user.name}.` : "Signed in with Strava."} Sync to import runs and walks.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-3">
          <SyncRunsForm />
          <form action={signOutAction}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="border-destructive/35">
        <CardHeader>
          <CardTitle>Delete my data</CardTitle>
          <CardDescription>
            This permanently removes your account and imported activities from Own Pace. It doesn&apos;t delete any activities on Strava.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteDataForm />
        </CardContent>
      </Card>
    </div>
  )
}
