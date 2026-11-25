import { expect, it } from "vitest";
import type { CityBoundary } from "./city-lookup-data";
import { runnableTileKeys, walkabilityBounds } from "./city-walkability";
import { tileRowCenterLatitude } from "./tiles";

const zoom = 5;
const point = (x: number, y: number) => ({ lon: x / 2 ** zoom * 360 - 180, lat: tileRowCenterLatitude(y - 0.5, zoom) });
const line = (x1: number, x2: number, y = 6.5) => [point(x1, y), point(x2, y)];
const ring = (x1: number, x2: number, y1 = 6, y2 = 7) => [point(x1, y1), point(x2, y1), point(x2, y2), point(x1, y2), point(x1, y1)];
const coordinates = (points: { lon: number; lat: number }[]) => points.map(({ lon, lat }) => [lon, lat]);
const boundary: CityBoundary = { type: "Polygon", coordinates: [coordinates(ring(4, 9, 5, 9))] };
const road = (tags: Record<string, string> = {}, geometry = line(4.1, 7.9)) => ({ type: "way", tags: { highway: "footway", ...tags }, geometry });
const polygon = (tags: Record<string, string>, geometry = ring(5, 6)) => ({ type: "way", tags, geometry });
const keys = (...elements: unknown[]) => runnableTileKeys({ elements }, boundary, zoom);

it("traces streets between nodes without filling rural tiles, and clips to the municipal polygon", () => {
  expect(keys(road({}, line(3, 10)))).toEqual(["4/6", "5/6", "6/6", "7/6", "8/6"]);
  expect(keys(road())).toEqual(["4/6", "5/6", "6/6", "7/6"]);
});

it.each<Record<string, string>>([
  { highway: "motorway" }, { highway: "trunk" }, { highway: "motorway_link" },
  { access: "private" }, { access: "military" }, { access: "no" }, { access: "permit" },
  { access: "customers" }, { foot: "no" }, { foot: "private" }, { motorroad: "yes" },
  { "foot:conditional": "yes @ (sunrise-sunset)" }, { area: "yes" },
])("rejects unsafe or restricted highway tags %j", (tags) => {
  expect(keys(road(tags))).toEqual([]);
});

it.each(["residential", "footway", "pedestrian", "path", "track", "living_street", "cycleway", "tertiary", "secondary", "service"])(
  "accepts public %s highways", (highway) => {
    expect(keys(road({ highway, access: "yes", foot: "designated" }))).toEqual(["4/6", "5/6", "6/6", "7/6"]);
  },
);

it.each<Record<string, string>>([{ landuse: "military" }, { military: "training_area" }, { access: "private" }, { access: "no" }])(
  "clips a sparse public way at restricted polygon edges %j", (tags) => {
    expect(keys(road(), polygon(tags))).toEqual(["4/6", "6/6", "7/6"]);
    expect(keys(road({ bridge: "yes" }), polygon(tags))).toEqual(["4/6", "6/6", "7/6"]);
  },
);

it("keeps a mixed tile when a public section remains outside the restriction", () => {
  expect(keys(road(), polygon({ access: "private" }, ring(5.2, 5.8)))).toEqual(["4/6", "5/6", "6/6", "7/6"]);
});

it("does not mistake a closed private road loop for a restricted land polygon", () => {
  const loop = polygon({ highway: "service", access: "private" }, ring(4, 8, 5, 8));
  expect(keys(road(), loop)).toEqual(["4/6", "5/6", "6/6", "7/6"]);
});

it("excludes water unless the allowed highway is explicitly a bridge", () => {
  const water = polygon({ natural: "water" });
  expect(keys(road(), water)).toEqual(["4/6", "6/6", "7/6"]);
  expect(keys(road({ bridge: "yes" }), water)).toEqual(["4/6", "5/6", "6/6", "7/6"]);
  expect(keys(road({ bridge: "no" }), water)).toEqual(["4/6", "6/6", "7/6"]);
  expect(keys(road({ highway: "trunk", bridge: "yes" }), water)).toEqual([]);
});

it("assembles reversed multipolygon members and respects restriction holes", () => {
  const outer = ring(4, 8, 5, 8), inner = ring(5, 6);
  const restriction = {
    type: "relation", tags: { type: "multipolygon", landuse: "military" },
    members: [
      { type: "way", role: "outer", geometry: outer.slice(0, 3) },
      { type: "way", role: "outer", geometry: outer.slice(2).reverse() },
      { type: "way", role: "inner", geometry: inner },
    ],
  };
  expect(keys(road(), restriction)).toEqual(["5/6"]);
});

it("clips roads crossing municipal holes even when both road nodes are outside the hole", () => {
  const withHole: CityBoundary = { type: "Polygon", coordinates: [...boundary.coordinates, coordinates(ring(5, 6))] };
  expect(runnableTileKeys({ elements: [road()] }, withHole, zoom)).toEqual(["4/6", "6/6", "7/6"]);
});

it("rejects partial, malformed, or timed-out Overpass responses rather than certifying an empty catalog", () => {
  expect(() => runnableTileKeys({ remark: "runtime error: timeout", elements: [] }, boundary, zoom)).toThrow("Incomplete");
  expect(() => runnableTileKeys({}, boundary, zoom)).toThrow("Incomplete");
  expect(() => keys(road({}, [{ lon: NaN, lat: 40 }]))).toThrow();
  expect(() => keys({ type: "relation", tags: { type: "multipolygon", access: "private" }, members: [
    { type: "way", role: "outer", geometry: line(4, 7) },
  ] })).toThrow("Incomplete");
  expect(keys()).toEqual([]);
});

it("wraps antimeridian paths and bounds rather than traversing the world", () => {
  const shape: CityBoundary = { type: "Polygon", coordinates: [[[170, -10], [-170, -10], [-170, 10], [170, 10], [170, -10]]] };
  expect(walkabilityBounds(shape)).toEqual([[-10, 170, 10, 180], [-10, -180, 10, -170]]);
  expect(runnableTileKeys({ elements: [road({}, [{ lon: 175, lat: 1 }, { lon: -175, lat: 1 }])] }, shape, zoom)).toEqual(["0/15", "31/15"]);
});
