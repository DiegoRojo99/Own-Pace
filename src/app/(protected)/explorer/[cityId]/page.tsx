import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { CityMap } from "@/components/city-map"
import { db } from "@/lib/db"
import { requireUser } from "@/lib/session"
import { TILE_ZOOM } from "@/lib/tiles"

export default async function CityPage({ params }: { params: Promise<{ cityId: string }> }) {
  const { id } = await requireUser()
  const { cityId } = await params
  // Only cities the signed-in user has added are visible.
  const userCity = await db.userCity.findFirst({
    where: { userId: id, cityId },
    select: { label: true, city: { select: { name: true, tilesReady: true, tileZoom: true } } },
  })
  if (!userCity) notFound()
  if (!userCity.city.tilesReady || userCity.city.tileZoom !== TILE_ZOOM) redirect("/explorer")

  const [cityTiles, userTiles] = await Promise.all([
    db.cityTile.findMany({ where: { cityId, zoom: TILE_ZOOM }, select: { x: true, y: true } }),
    db.$queryRaw<{ x: number; y: number }[]>`
      SELECT ut."x", ut."y" FROM "UserTile" ut
      JOIN "CityTile" ct ON ct."zoom" = ut."zoom" AND ct."x" = ut."x" AND ct."y" = ut."y"
      WHERE ut."userId" = ${id} AND ct."cityId" = ${cityId} AND ut."zoom" = ${TILE_ZOOM}`,
  ])
  const explored = new Set(userTiles.map(({ x, y }) => `${x}/${y}`))
  const done: [number, number][] = []
  const fog: [number, number][] = []
  for (const { x, y } of cityTiles) (explored.has(`${x}/${y}`) ? done : fog).push([x, y])
  const total = cityTiles.length
  const percentage = total ? (done.length / total * 100).toFixed(1).replace(/\.0$/, "") : "0"

  return <div className="space-y-5">
    <div>
      <Link href="/explorer" className="text-sm font-semibold text-primary hover:underline">← Explorer</Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight wrap-anywhere sm:text-4xl">{userCity.city.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{userCity.label}</p>
      <p className="mt-3 text-sm font-semibold">{done.length.toLocaleString("en-US")} <span className="font-normal text-muted-foreground">of {total.toLocaleString("en-US")} tiles · {percentage}% explored</span></p>
    </div>
    <CityMap explored={done} unexplored={fog} zoom={TILE_ZOOM} />
  </div>
}
