import Link from "next/link"
import { notFound } from "next/navigation"
import { BoundaryEditor } from "@/components/boundary-editor"
import { requireAdmin } from "@/lib/admin"
import { db } from "@/lib/db"

export default async function AdminCityPage({ params }: { params: Promise<{ cityId: string }> }) {
  await requireAdmin()
  const { cityId } = await params
  const city = await db.city.findUnique({ where: { id: cityId }, select: { id: true, name: true, boundary: true } })
  if (!city) notFound()
  return <div className="space-y-5">
    <div>
      <Link href="/admin/cities" className="text-sm font-semibold text-primary hover:underline">← City boundaries</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight wrap-anywhere">{city.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Edit the GeoJSON Polygon or MultiPolygon. Saving rebuilds this city&apos;s tiles for every user tracking it.</p>
    </div>
    <BoundaryEditor cityId={city.id} initial={JSON.stringify(city.boundary)} />
  </div>
}
