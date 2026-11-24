/** Fixed slippy-map zoom used for explorer tiles. */
export const TILE_ZOOM = 14;
const MAX_LAT = 85.0511287798066;

function projected(lon: number, lat: number, zoom: number): [number, number] {
  const n = 2 ** zoom;
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const radians = clamped * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n];
}

/** Convert longitude and latitude to a Web Mercator tile, clamping at the poles. */
export function lonLatToTile(lon: number, lat: number, zoom: number): { x: number; y: number } {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90 || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) {
    throw new Error("Invalid tile coordinates or zoom");
  }
  const n = 2 ** zoom;
  const [x, y] = projected(lon, lat, zoom);
  return { x: Math.min(n - 1, Math.max(0, Math.floor(x))), y: Math.min(n - 1, Math.max(0, Math.floor(y))) };
}

/** Return Leaflet-compatible south-west and north-east tile corners. */
export function tileToBounds(x: number, y: number, zoom: number): [[number, number], [number, number]] {
  const n = 2 ** zoom;
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 22 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    throw new Error("Invalid tile coordinates or zoom");
  }
  const lat = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / n))) * 180 / Math.PI;
  return [[lat(y + 1), x / n * 360 - 180], [lat(y), (x + 1) / n * 360 - 180]];
}

/** Trace each segment through the projected grid, wrapping across the antimeridian. */
export function tilesForRoute(points: [number, number][], zoom: number): Set<string> {
  const n = 2 ** zoom;
  const tiles = new Set<string>();
  let crossings = 0;
  const add = (x: number, y: number) => {
    if (y >= 0 && y < n) tiles.add(`${((x % n) + n) % n}/${y}`);
  };
  let previous: [number, number] | undefined;
  for (const [lat, lon] of points) {
    lonLatToTile(lon, lat, zoom);
    const [rawX, rawY] = projected(lon, lat, zoom);
    const x = Math.min(n - Number.EPSILON * n, rawX);
    const y = Math.max(0, Math.min(n - Number.EPSILON * n, rawY));
    if (!previous) {
      add(Math.floor(x), Math.floor(y));
    } else {
      let endX = x;
      if (endX - previous[0] > n / 2) endX -= n;
      if (endX - previous[0] < -n / 2) endX += n;
      const dx = endX - previous[0], dy = y - previous[1];
      let cx = Math.floor(previous[0]), cy = Math.floor(previous[1]);
      const endCol = Math.floor(endX), endRow = Math.floor(y);
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let tx = dx === 0 ? Infinity : ((sx > 0 ? cx + 1 : cx) - previous[0]) / dx;
      let ty = dy === 0 ? Infinity : ((sy > 0 ? cy + 1 : cy) - previous[1]) / dy;
      const stepX = dx === 0 ? Infinity : 1 / Math.abs(dx);
      const stepY = dy === 0 ? Infinity : 1 / Math.abs(dy);
      add(cx, cy);
      while (cx !== endCol || cy !== endRow) {
        if (++crossings > 1_000_000) throw new Error("Route crosses too many tiles to process safely");
        const nextX = cx === endCol ? Infinity : tx;
        const nextY = cy === endRow ? Infinity : ty;
        if (nextX < nextY) { cx += sx; tx += stepX; }
        else if (nextY < nextX) { cy += sy; ty += stepY; }
        else {
          add(cx + sx, cy);
          add(cx, cy + sy);
          cx += sx; cy += sy; tx += stepX; ty += stepY;
        }
        add(cx, cy);
      }
    }
    previous = [x, y];
  }
  return tiles;
}
