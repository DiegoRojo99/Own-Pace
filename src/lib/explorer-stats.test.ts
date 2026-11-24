import { expect, it } from "vitest";
import { largestCluster, largestSquare, tilesByMonth, totalTiles } from "./explorer-stats";

it("finds a square and an edge-connected cluster in a sparse grid", () => {
  const tiles = new Set<string>();
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) tiles.add(`${x}/${y}`);
  tiles.add("20/20");
  expect(totalTiles(tiles)).toBe(10);
  expect(largestSquare(tiles)).toBe(3);
  expect(largestCluster(tiles)).toBe(9);
  expect(largestSquare(new Set())).toBe(0);
  expect(largestCluster(new Set(["0/0", "1/1"]))).toBe(1);
});

it("counts first visits in UTC month order", () => {
  expect(tilesByMonth([
    { x: 0, y: 0, firstVisitedAt: new Date("2026-02-01T00:00:00Z") },
    { x: 1, y: 0, firstVisitedAt: new Date("2026-01-31T23:59:59Z") },
    { x: 2, y: 0, firstVisitedAt: new Date("2026-01-01T00:00:00Z") },
  ])).toEqual([{ month: "2026-01", count: 2 }, { month: "2026-02", count: 1 }]);
});
