import Link from "next/link"
import { db } from "@/lib/db"
import { requireAdmin } from "@/lib/admin"

export default async function AdminCitiesPage() {
  await requireAdmin()
  const cities = await db.city.findMany({
    select: { id: true, name: true, tilesReady: true, _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  })
  return <div className="space-y-5">
    <div><p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">Admin</p><h1 className="mt-1 text-3xl font-bold tracking-tight">City boundaries</h1></div>
    {cities.length ? <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {cities.map((city) => <li key={city.id} className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0"><Link className="font-semibold text-primary hover:underline" href={`/admin/cities/${city.id}`}>{city.name}</Link>
          <p className="text-xs text-muted-foreground">{city._count.users} {city._count.users === 1 ? "user" : "users"} · {city.tilesReady ? "tiles ready" : "tiles pending"}</p></div>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No cities yet.</p>}
  </div>
}
