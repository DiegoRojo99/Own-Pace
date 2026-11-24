import { describe, expect, it } from "vitest";
import { cityTileBatch, type CityTileCursor } from "./city-tiles";
import { tileRowCenterLatitude, tileToBounds } from "./tiles";
import type { CityBoundary } from "./city-lookup-data";

const zoom = 4;

function rectangle(x1: number, y1: number, x2: number, y2: number): number[][] {
  const [[south, west]] = tileToBounds(x1, y2, zoom);
  const [, [north, east]] = tileToBounds(x2, y1, zoom);
  return [[west, south], [east, south], [east, north], [west, north], [west, south]];
}

function collect(boundary: CityBoundary, maxTiles = 1500, maxRows = 10) {
  let cursor: CityTileCursor | null = null;
  const tiles = new Set<string>();
  let calls = 0;
  do {
    const batch = cityTileBatch(boundary, zoom, cursor, maxTiles, maxRows);
    expect(batch.tiles.length).toBeLessThanOrEqual(maxTiles);
    for (const tile of batch.tiles) {
      const key = `${tile.x}/${tile.y}`;
      expect(tiles.has(key)).toBe(false);
      tiles.add(key);
    }
    cursor = batch.next;
    if (++calls > 100) throw new Error("Batch did not finish");
  } while (cursor);
  return tiles;
}

describe("city tiles", () => {
  it("counts tile centers inside a polygon, excluding holes", () => {
    const boundary: CityBoundary = { type: "Polygon", coordinates: [rectangle(4, 4, 6, 6), rectangle(5, 5, 5, 5)] };
    expect(collect(boundary)).toEqual(new Set(["4/4", "5/4", "6/4", "4/5", "6/5", "4/6", "5/6", "6/6"]));
  });

  it("deduplicates overlapping multipolygons and resumes without missing tiles", () => {
    const boundary: CityBoundary = { type: "MultiPolygon", coordinates: [[rectangle(4, 4, 6, 6)], [rectangle(6, 6, 7, 7)]] };
    expect(collect(boundary, 2, 1)).toEqual(collect(boundary));
    expect(collect(boundary).size).toBe(12);
  });

  it("wraps an antimeridian boundary instead of covering the whole world", () => {
    const [[south], [north]] = tileToBounds(0, 7, zoom);
    const boundary: CityBoundary = { type: "Polygon", coordinates: [[[160, south], [-160, south], [-160, north], [160, north], [160, south]]] };
    expect(collect(boundary)).toEqual(new Set(["0/7", "15/7"]));
  });

  it("excludes tile centers lying exactly on polygon edges", () => {
    const left = (5.5 / 16) * 360 - 180;
    const right = (7.5 / 16) * 360 - 180;
    const [, [north]] = tileToBounds(5, 4, zoom);
    const south = tileRowCenterLatitude(5, zoom);
    const boundary: CityBoundary = { type: "Polygon", coordinates: [[[left, south], [right, south], [right, north], [left, north], [left, south]]] };
    expect(collect(boundary)).toEqual(new Set(["6/4"]));
  });

  it("matches an independent point-in-polygon check for an irregular boundary", () => {
    const outer = [[-140, 10], [-45, 70], [80, 10], [30, -55], [-140, 10]];
    const hole = [[-50, 10], [-15, 25], [5, 0], [-50, 10]];
    const boundary: CityBoundary = { type: "Polygon", coordinates: [outer, hole] };
    const contains = (ring: number[][], lon: number, lat: number) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [ax, ay] = ring[i], [bx, by] = ring[j];
        if ((ay > lat) !== (by > lat) && lon < (bx - ax) * (lat - ay) / (by - ay) + ax) inside = !inside;
      }
      return inside;
    };
    const expected = new Set<string>();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const lat = tileRowCenterLatitude(y, zoom), lon = (x + 0.5) / 16 * 360 - 180;
      if (contains(outer, lon, lat) && !contains(hole, lon, lat)) expected.add(`${x}/${y}`);
    }
    expect(collect(boundary, 3, 2)).toEqual(expected);
  });
});
