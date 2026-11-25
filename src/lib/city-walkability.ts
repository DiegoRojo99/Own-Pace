import type { CityBoundary } from "./city-lookup-data";
import { tilesForRoute } from "./tiles";

type Point = [number, number];
type Tags = Record<string, string>;
type Way = { type: "way"; tags: Tags; geometry: Point[] };
type Edge = { a: Point; b: Point; bounds: number[] };
type Area = { outer: Point[][]; inner: Point[][]; water: boolean; bounds: number[]; edgeRows: Edge[][] };
type Member = { type: string; role: string; geometry?: Point[] };
type Relation = { type: "relation"; tags: Tags; members: Member[] };

export const RUNNABLE_HIGHWAYS = [
  "residential", "footway", "pedestrian", "path", "track", "living_street",
  "cycleway", "tertiary", "tertiary_link", "secondary", "secondary_link",
  "primary", "primary_link", "unclassified", "service", "steps", "road",
] as const;
const highways = new Set<string>(RUNNABLE_HIGHWAYS);
const denied = new Set(["private", "no", "military"]);
const publicAccess = new Set(["yes", "permissive", "designated", "official"]);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function geometry(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 2) throw new Error("Incomplete OSM geometry");
  return value.map((point) => {
    if (!record(point) || typeof point.lon !== "number" || typeof point.lat !== "number" ||
        !Number.isFinite(point.lon) || !Number.isFinite(point.lat) || Math.abs(point.lon) > 180 || Math.abs(point.lat) > 90) {
      throw new Error("Invalid OSM coordinates");
    }
    return [point.lon, point.lat];
  });
}

function elements(data: unknown): (Way | Relation)[] {
  if (!record(data) || data.remark || !Array.isArray(data.elements)) throw new Error("Incomplete Overpass response");
  return data.elements.map((element) => {
    if (!record(element) || !record(element.tags) || !Object.values(element.tags).every((tag) => typeof tag === "string")) {
      throw new Error("Invalid Overpass element");
    }
    const tags: Tags = {};
    for (const [key, value] of Object.entries(element.tags)) {
      if (typeof value === "string") tags[key] = value;
    }
    if (element.type === "way") return { type: "way", tags, geometry: geometry(element.geometry) };
    if (element.type !== "relation" || !Array.isArray(element.members)) throw new Error("Invalid Overpass relation");
    const members = element.members.map((member): Member => {
      if (!record(member) || typeof member.type !== "string" || typeof member.role !== "string") throw new Error("Invalid OSM member");
      return { type: member.type, role: member.role, geometry: member.geometry === undefined ? undefined : geometry(member.geometry) };
    });
    return { type: "relation", tags, members };
  });
}

function same(a: Point, b: Point) { return a[0] === b[0] && a[1] === b[1]; }

function rings(parts: Point[][]): Point[][] {
  const pending = parts.map((part) => [...part]);
  const result: Point[][] = [];
  while (pending.length) {
    const ring = pending.pop()!;
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const index = pending.findIndex((part) => same(end, part[0]) || same(end, part[part.length - 1]));
      if (index < 0) throw new Error("Incomplete OSM restriction polygon");
      const part = pending.splice(index, 1)[0];
      if (!same(end, part[0])) part.reverse();
      ring.push(...part.slice(1));
    }
    if (ring.length < 4) throw new Error("Invalid OSM restriction polygon");
    result.push(ring);
  }
  return result;
}

function unwrap(points: number[][], reference: number): Point[] {
  let previous = reference;
  return points.map(([lon, lat]) => {
    previous = lon + 360 * Math.round((previous - lon) / 360);
    return [previous, lat];
  });
}

function area(outer: Point[][], inner: Point[][], water = false): Area {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of outer) for (const [x, y] of ring) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], y);
  }
  const edgeRows: Edge[][] = Array.from({ length: 16 }, () => []);
  for (const ring of [...outer, ...inner]) for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i];
    const edge = { a, b, bounds: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] };
    for (let row = edgeRow(bounds, edge.bounds[1]); row <= edgeRow(bounds, edge.bounds[3]); row++) edgeRows[row].push(edge);
  }
  return { outer, inner, water, bounds, edgeRows };
}

function edgeRow(bounds: number[], latitude: number) {
  const height = bounds[3] - bounds[1];
  return height === 0 ? 0 : Math.max(0, Math.min(15, Math.floor((latitude - bounds[1]) / height * 16)));
}

function nearbyEdges(shape: Area, a: Point, b: Point) {
  const edges = new Set<Edge>();
  for (let row = edgeRow(shape.bounds, Math.min(a[1], b[1])); row <= edgeRow(shape.bounds, Math.max(a[1], b[1])); row++) {
    for (const edge of shape.edgeRows[row]) if (overlaps(edge.bounds, a, b)) edges.add(edge);
  }
  return edges;
}

function boundaryAreas(boundary: CityBoundary): Area[] {
  const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
  const reference = polygons[0][0][0][0];
  return polygons.map((polygon) => area([unwrap(polygon[0], reference)], polygon.slice(1).map((ring) => unwrap(ring, reference))));
}

/** Split antimeridian-spanning bounds into ordinary Overpass bounding boxes. */
export function walkabilityBounds(boundary: CityBoundary): number[][] {
  return boundaryAreas(boundary).flatMap(({ bounds: [west, south, east, north] }) => {
    const shift = 360 * Math.floor((west + 180) / 360);
    west -= shift; east -= shift;
    if (east - west >= 360) return [[south, -180, north, 180]];
    return east <= 180 ? [[south, west, north, east]] : [[south, west, north, 180], [south, -180, north, east - 360]];
  });
}

function inRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-14 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) inside = !inside;
  }
  return inside;
}

function contains(shape: Area, point: Point) {
  return shape.outer.some((ring) => inRing(point, ring)) && !shape.inner.some((ring) => inRing(point, ring));
}

function overlaps(bounds: number[], a: Point, b: Point) {
  return bounds[0] <= Math.max(a[0], b[0]) && bounds[2] >= Math.min(a[0], b[0]) &&
    bounds[1] <= Math.max(a[1], b[1]) && bounds[3] >= Math.min(a[1], b[1]);
}

function restrictions(items: (Way | Relation)[], reference: number): Area[] {
  const result: Area[] = [];
  for (const item of items) {
    const tags = item.tags;
    const restricted = tags.landuse === "military" || tags.military !== undefined || denied.has(tags.access) || denied.has(tags.foot);
    const water = tags.natural === "water" || tags.waterway === "river" || tags.waterway === "riverbank";
    if (!restricted && !water) continue;
    let outer: Point[][], inner: Point[][];
    if (item.type === "way") {
      if (!same(item.geometry[0], item.geometry[item.geometry.length - 1]) || tags.area === "no") continue;
      if (tags.highway && tags.area !== "yes" && !tags.landuse && !tags.military && !tags.natural) continue;
      outer = [item.geometry]; inner = [];
    } else {
      if (tags.type !== "multipolygon" && tags.type !== "boundary") continue;
      const members = item.members.filter((member) => ["", "outer", "inner"].includes(member.role));
      if (members.some((member) => member.type !== "way" || !member.geometry)) throw new Error("Incomplete OSM restriction members");
      outer = rings(members.filter((member) => member.role !== "inner").map((member) => member.geometry!));
      inner = rings(members.filter((member) => member.role === "inner").map((member) => member.geometry!));
      if (!outer.length) throw new Error("Missing OSM restriction outline");
    }
    result.push(area(outer.map((ring) => unwrap(ring, reference)), inner.map((ring) => unwrap(ring, reference)), water && !restricted));
  }
  return result;
}

/** Keep only positive-length public highway sections inside the city and outside restricted areas. */
export function runnableTileKeys(data: unknown, boundary: CityBoundary, zoom: number): string[] {
  const items = elements(data);
  const city = boundaryAreas(boundary);
  const reference = city[0].outer[0][0][0];
  const blocked = restrictions(items, reference);
  const tiles = new Set<string>();
  let checks = 0;
  for (const way of items) {
    if (way.type !== "way" || !highways.has(way.tags.highway) || way.tags.area === "yes" ||
        (way.tags.access !== undefined && !publicAccess.has(way.tags.access)) ||
        (way.tags.foot !== undefined && !publicAccess.has(way.tags.foot)) || way.tags.motorroad === "yes" ||
        way.tags.military !== undefined || way.tags.landuse === "military" ||
        Object.keys(way.tags).some((key) => /^(access|foot|highway|motorroad):conditional$/.test(key))) continue;
    const bridge = way.tags.bridge !== undefined && !["no", "false", "0"].includes(way.tags.bridge);
    const points = unwrap(way.geometry, reference);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (same(a, b)) continue;
      const borders = city.filter((shape) => overlaps(shape.bounds, a, b));
      if (!borders.length) continue;
      const exclusions = blocked.filter((shape) => !(shape.water && bridge) && overlaps(shape.bounds, a, b));
      const cuts = [0, 1];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      for (const shape of [...borders, ...exclusions]) {
        for (const { a: c, b: d } of nearbyEdges(shape, a, b)) {
          if (++checks > 20_000_000) throw new Error("OSM geometry is too complex to process safely");
          const ex = d[0] - c[0], ey = d[1] - c[1], determinant = dx * ey - dy * ex;
          if (determinant === 0) {
            // Collinear edges still split a way where it enters/leaves a restricted boundary.
            if (Math.abs((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) < 1e-14) {
              for (const point of [c, d]) {
                const t = Math.abs(dx) >= Math.abs(dy) ? (point[0] - a[0]) / dx : (point[1] - a[1]) / dy;
                if (t > 0 && t < 1) cuts.push(t);
              }
            }
            continue;
          }
          const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / determinant;
          const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / determinant;
          if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
        }
      }
      cuts.sort((x, y) => x - y);
      const at = (t: number): Point => [a[0] + dx * t, a[1] + dy * t];
      for (let j = 1; j < cuts.length; j++) {
        const start = cuts[j - 1], end = cuts[j];
        if (end - start < 1e-12) continue;
        const midpoint = at((start + end) / 2);
        if (!borders.some((shape) => contains(shape, midpoint)) || exclusions.some((shape) => contains(shape, midpoint))) continue;
        const inset = (end - start) * 1e-8;
        const route = [at(start + inset), at(end - inset)].map(([lon, lat]): Point => [lat, ((lon + 180) % 360 + 360) % 360 - 180]);
        for (const key of tilesForRoute(route, zoom)) tiles.add(key);
        if (tiles.size > 250_000) throw new Error("City has too many runnable tiles");
      }
    }
  }
  return [...tiles].sort();
}
