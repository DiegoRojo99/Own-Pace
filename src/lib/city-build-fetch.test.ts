import { afterEach, expect, it, vi } from "vitest";
import { buildRunnableKeys } from "./city-build-fetch";
import type { CityBoundary } from "./city-lookup-data";

const boundary: CityBoundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 41], [-3, 40]]] };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("falls back to a mirror and uses the existing highway geometry filter", async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(Response.json({
    elements: [{ type: "way", tags: { highway: "footway" }, geometry: [{ lon: -2.5, lat: 40.2 }, { lon: -2.4, lat: 40.2 }] }],
  }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const keys = await buildRunnableKeys(boundary, "https://example.test/api/interpreter");
  expect(keys.length).toBeGreaterThan(0);
  expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/api/interpreter");
  expect(fetchMock.mock.calls[1][0]).toBe("https://overpass-api.de/api/interpreter");
  expect(fetchMock.mock.calls[1][1].headers["User-Agent"]).toContain("OwnPace");
});

it("fails instead of returning an empty or partial catalog when all providers fail", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ remark: "runtime error", elements: [] })));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await expect(buildRunnableKeys(boundary, undefined)).rejects.toThrow("All Overpass endpoints failed");
});

it("rejects insecure or malformed endpoint configuration before any request", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  await expect(buildRunnableKeys(boundary, "http://example.test")).rejects.toThrow("HTTPS");
  expect(fetchMock).not.toHaveBeenCalled();
});
