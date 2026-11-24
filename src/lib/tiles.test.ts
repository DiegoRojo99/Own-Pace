import { describe, expect, it } from "vitest";
import { lonLatToTile, tileToBounds, tilesForRoute } from "./tiles";

describe("slippy tiles", () => {
  it("round trips locations through their bounds, including the Mercator limits", () => {
    for (const [lon, lat] of [[0, 0], [-3.7038, 40.4168], [179.99, -85], [-180, 90], [180, -90]]) {
      const { x, y } = lonLatToTile(lon, lat, 14);
      const [[south, west], [north, east]] = tileToBounds(x, y, 14);
      expect(lon).toBeGreaterThanOrEqual(west);
      expect(lon).toBeLessThanOrEqual(east);
      expect(Math.max(-85.0511287798066, Math.min(85.0511287798066, lat))).toBeGreaterThanOrEqual(south - 1e-10);
      expect(Math.max(-85.0511287798066, Math.min(85.0511287798066, lat))).toBeLessThanOrEqual(north + 1e-10);
    }
  });

  it("traces intermediate tiles on long segments", () => {
    const tiles = tilesForRoute([[0.01, 0.001], [0.01, 0.2]], 14);
    const start = lonLatToTile(0.001, 0.01, 14);
    const end = lonLatToTile(0.2, 0.01, 14);
    expect(tiles.size).toBe(end.x - start.x + 1);
    for (let x = start.x; x <= end.x; x++) expect(tiles.has(`${x}/${start.y}`)).toBe(true);
  });

  it("wraps at the antimeridian and handles empty and invalid routes", () => {
    const tiles = tilesForRoute([[1, 179.99], [1, -179.99]], 14);
    expect(tiles.size).toBe(2);
    expect(tilesForRoute([], 14).size).toBe(0);
    expect(() => tilesForRoute([[91, 0]], 14)).toThrow();
    expect(() => lonLatToTile(NaN, 0, 14)).toThrow();
  });

  it("handles segments ending exactly at grid boundaries", () => {
    expect(tilesForRoute([[0.01, -0.01], [0, 0]], 14).size).toBeGreaterThan(0);
  });
});
