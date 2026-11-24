import type { CityBoundary } from "./city-lookup-data";
import { lonLatToTile, longitudeToTileX, tileRowCenterLatitude } from "./tiles";

type Point = [number, number];
type Polygon = Point[][];
type Span = [number, number];
export type CityTileCursor = { x: number; y: number };

function polygonsForBoundary(boundary: CityBoundary): Polygon[] {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  return polygons.map((polygon) => {
    let reference = 0;
    return polygon.map((ring, ringIndex) => {
      const points: Point[] = [];
      for (const [longitude, latitude] of ring) {
        let lon = longitude;
        const previous = points.length ? points[points.length - 1][0] : ringIndex ? reference : longitude;
        lon += 360 * Math.round((previous - lon) / 360);
        points.push([lon, latitude]);
      }
      if (ringIndex === 0) reference = points[0][0];
      return points;
    });
  });
}

function merge(spans: Span[]): Span[] {
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const result: Span[] = [];
  for (const [start, end] of spans) {
    const last = result[result.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function rowSpans(polygons: Polygon[], latitude: number, zoom: number): Span[] {
  const n = 2 ** zoom;
  const all: Span[] = [];
  for (const polygon of polygons) {
    const crossings: number[] = [];
    const horizontal: Span[] = [];
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
        if (ay === by && ay === latitude) {
          horizontal.push([Math.min(ax, bx), Math.max(ax, bx)]);
        } else if ((ay > latitude) !== (by > latitude)) {
          crossings.push(ax + (latitude - ay) * (bx - ax) / (by - ay));
        }
      }
    }
    crossings.sort((a, b) => a - b);
    if (crossings.length % 2 !== 0) throw new Error("Invalid city boundary intersections");
    const spans: Span[] = [];
    for (let i = 0; i < crossings.length; i += 2) {
      let parts: Span[] = [[crossings[i], crossings[i + 1]]];
      // Centers exactly on a boundary are not strictly inside the polygon.
      for (const [left, right] of horizontal) {
        parts = parts.flatMap(([start, end]) => right < start || left > end ? [[start, end] as Span] : [
          ...(left > start ? [[start, Math.min(end, left)] as Span] : []),
          ...(right < end ? [[Math.max(start, right), end] as Span] : []),
        ]);
      }
      spans.push(...parts);
    }
    for (const [left, right] of spans) {
      const first = Math.floor(longitudeToTileX(left, zoom) - 0.5) + 1;
      const last = Math.ceil(longitudeToTileX(right, zoom) - 0.5) - 1;
      if (last < first) continue;
      if (last - first + 1 >= n) { all.push([0, n - 1]); continue; }
      const start = ((first % n) + n) % n, end = ((last % n) + n) % n;
      if (start <= end) all.push([start, end]);
      else all.push([start, n - 1], [0, end]);
    }
  }
  return merge(all);
}

/** Enumerate strictly interior tile centers in bounded, resumable scanline batches. */
export function cityTileBatch(boundary: CityBoundary, zoom: number, cursor: CityTileCursor | null, maxTiles = 1500, maxRows = 10) {
  const polygons = polygonsForBoundary(boundary);
  let south = 90, north = -90;
  for (const polygon of polygons) for (const ring of polygon) for (const [, lat] of ring) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const firstRow = lonLatToTile(0, north, zoom).y;
  const lastRow = lonLatToTile(0, south, zoom).y;
  let y = cursor?.y ?? firstRow, x = cursor?.x ?? 0;
  const tiles: { zoom: number; x: number; y: number }[] = [];
  let rows = 0;
  while (y <= lastRow && rows < maxRows) {
    const spans = rowSpans(polygons, tileRowCenterLatitude(y, zoom), zoom);
    for (const [start, end] of spans) {
      for (let col = Math.max(start, x); col <= end; col++) {
        tiles.push({ zoom, x: col, y });
        if (tiles.length >= maxTiles) return { tiles, next: { x: col + 1, y } };
      }
    }
    y++;
    x = 0;
    rows++;
  }
  return { tiles, next: y <= lastRow ? { x, y } : null };
}
