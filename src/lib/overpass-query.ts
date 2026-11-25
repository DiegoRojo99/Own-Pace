import type { CityBoundary } from "./city-lookup-data";
import { RUNNABLE_HIGHWAYS, walkabilityBounds } from "./city-walkability";

export function overpassQuery(boundary: CityBoundary) {
  const filters = [
    '["landuse"="military"]', '["military"]',
    '["access"~"^(private|no|military)$"]', '["foot"~"^(private|no|military)$"]',
    '["natural"="water"]', '["waterway"~"^(river|riverbank)$"]',
  ];
  const selectors = [`way["highway"~"^(${RUNNABLE_HIGHWAYS.join("|")})$"]`,
    ...filters.flatMap((filter) => [`way${filter}`, `rel${filter}`])];
  const boxes = walkabilityBounds(boundary);
  const queries = boxes.flatMap((box) => selectors.map((selector) => `${selector}(${box.join(",")});`));
  const enclosing = boxes.map(([south, west, north, east], index) =>
    `is_in(${(south + north) / 2},${(west + east) / 2})->.enclosing${index};
    (${filters.flatMap((filter) => [`area.enclosing${index}${filter};`, `way.enclosing${index}${filter};`]).join("")})->.areas${index};`);
  const pivots = enclosing.map((_, index) => `way.areas${index};way(pivot.areas${index});rel(pivot.areas${index});`).join("");
  return `[out:json][timeout:20][maxsize:134217728];${enclosing.join("\n")}(${queries.join("")}${pivots});out geom;`;
}
