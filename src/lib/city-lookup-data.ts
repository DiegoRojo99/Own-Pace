export type CityCandidate = { osmType: "WAY" | "RELATION"; osmId: string; name: string; label: string };
type Position = number[];
type Ring = Position[];
type Polygon = Ring[];
export type CityBoundary = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: Polygon[] };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function position(value: unknown): value is Position {
  return Array.isArray(value) && value.length >= 2 && value.every((n) => typeof n === "number" && Number.isFinite(n)) &&
    Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

function ring(value: unknown): value is Ring {
  if (!Array.isArray(value) || value.length < 4 || !value.every(position)) return false;
  return value[0][0] === value[value.length - 1][0] && value[0][1] === value[value.length - 1][1];
}

function polygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length > 0 && value.every(ring);
}

export function parseBoundary(value: unknown): CityBoundary | null {
  if (!object(value)) return null;
  if (value.type === "Polygon" && polygon(value.coordinates)) return { type: "Polygon", coordinates: value.coordinates };
  if (value.type === "MultiPolygon" && Array.isArray(value.coordinates) && value.coordinates.length > 0 && value.coordinates.every(polygon)) {
    return { type: "MultiPolygon", coordinates: value.coordinates };
  }
  return null;
}

export function parseCandidate(value: unknown): CityCandidate | null {
  if (!object(value) || value.category !== "boundary" || value.type !== "administrative") return null;
  const osmType = value.osm_type === "way" ? "WAY" : value.osm_type === "relation" ? "RELATION" : null;
  const id = typeof value.osm_id === "number" && Number.isSafeInteger(value.osm_id) ? String(value.osm_id) : value.osm_id;
  if (!osmType || typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n ||
      typeof value.display_name !== "string" || !value.display_name.trim() || value.display_name.length > 500) return null;
  const label = value.display_name.trim();
  const name = typeof value.name === "string" && value.name.trim() ? value.name.trim() : label.split(",")[0].trim();
  if (!name || name.length > 200) return null;
  return { osmType, osmId: id, name, label };
}

export function isCityCandidate(value: unknown): value is CityCandidate {
  if (!object(value)) return false;
  return (value.osmType === "WAY" || value.osmType === "RELATION") &&
    typeof value.osmId === "string" && /^[1-9]\d{0,18}$/.test(value.osmId) && BigInt(value.osmId) <= 9_223_372_036_854_775_807n &&
    typeof value.name === "string" && value.name.length > 0 && value.name.length <= 200 &&
    typeof value.label === "string" && value.label.length > 0 && value.label.length <= 500;
}
