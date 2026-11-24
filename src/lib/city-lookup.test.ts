import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseBoundary, parseCandidate } from "./city-lookup-data";
import { searchCities, selectCity } from "./city-lookup";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), cacheFind: vi.fn(), cacheUpsert: vi.fn(),
  cityFind: vi.fn(), cityUpsert: vi.fn(), fetch: vi.fn(),
}));
vi.mock("./db", () => ({
  db: {
    $queryRaw: mocks.query, $executeRaw: mocks.execute,
    cityLookupCache: { findUnique: mocks.cacheFind, upsert: mocks.cacheUpsert },
    city: { findUnique: mocks.cityFind, upsert: mocks.cityUpsert },
  },
}));

const boundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 40]]] };
const place = { osm_type: "relation", osm_id: "5326784", category: "boundary", type: "administrative", name: "Madrid", display_name: "Madrid, Spain" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("CITY_NOMINATIM_URL", "");
  mocks.cacheFind.mockResolvedValue(null);
  mocks.cityFind.mockResolvedValue(null);
  mocks.query.mockResolvedValue([{ leaseId: "lease" }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("searches only on submission, caches public results, and filters non-boundaries", async () => {
  mocks.fetch.mockResolvedValue(Response.json([place, place, { ...place, osm_type: "node" }, { ...place, category: "place" }]));
  const expected = [{ osmType: "RELATION", osmId: "5326784", name: "Madrid", label: "Madrid, Spain" }];
  expect(await searchCities(" Madrid, Spain ")).toEqual(expected);
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url.pathname).toBe("/search");
  expect(url.searchParams.get("q")).toBe("Madrid, Spain");
  expect(url.searchParams.get("featureType")).toBe("city");
  expect(options.headers["User-Agent"]).toContain("OwnPace");
  expect(mocks.cacheUpsert.mock.calls[0][0].create.key).toMatch(/^[a-f0-9]{64}$/);
  expect(mocks.cacheUpsert.mock.calls[0][0].create.results).toEqual(expected);
  expect(mocks.execute).toHaveBeenCalledOnce();
});

it("serves cached searches without a provider request and enforces the shared lease", async () => {
  const cached = [{ osmType: "WAY", osmId: "42", name: "Town", label: "Town, Country" }];
  mocks.cacheFind.mockResolvedValueOnce({ results: cached, expiresAt: new Date(Date.now() + 60_000) });
  expect(await searchCities("Town")).toEqual(cached);
  expect(mocks.query).not.toHaveBeenCalled();
  mocks.query.mockResolvedValueOnce([]);
  await expect(searchCities("Other town")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("respects provider throttling and releases a lease after failures", async () => {
  mocks.fetch.mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "120" } }));
  await expect(searchCities("Madrid")).rejects.toMatchObject({ code: "rate-limit" });
  expect(mocks.execute.mock.calls[0][1]).toBe(120);
});

it("releases the lease after a network failure and rejects oversized responses", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("network"));
  await expect(searchCities("Madrid")).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.execute.mock.calls[0][1]).toBe(1);
  mocks.fetch.mockResolvedValueOnce(new Response("x".repeat(8 * 1024 * 1024 + 1)));
  await expect(searchCities("Madrid")).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.execute).toHaveBeenCalledTimes(2);
  expect(mocks.cacheUpsert).not.toHaveBeenCalled();
});

it("caches a selected polygon and reuses an existing city without a request", async () => {
  mocks.fetch.mockResolvedValue(Response.json([{ ...place, geojson: boundary }]));
  mocks.cityUpsert.mockResolvedValue({ id: "city1", name: "Madrid" });
  expect(await selectCity("RELATION", "5326784")).toEqual({ id: "city1", name: "Madrid" });
  expect(mocks.fetch.mock.calls[0][0].searchParams.get("osm_ids")).toBe("R5326784");
  expect(mocks.fetch.mock.calls[0][0].searchParams.get("polygon_geojson")).toBe("1");
  expect(mocks.cityUpsert).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ osmType: "RELATION", osmId: 5326784n, boundary }),
  }));
  mocks.cityFind.mockResolvedValueOnce({ id: "city1", name: "Madrid", boundary });
  expect(await selectCity("RELATION", "5326784")).toEqual({ id: "city1", name: "Madrid" });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it("caches unavailable boundaries to avoid repeated provider requests", async () => {
  mocks.fetch.mockResolvedValueOnce(Response.json([{ ...place, geojson: { type: "Point", coordinates: [0, 0] } }]));
  await expect(selectCity("RELATION", "5326784")).rejects.toMatchObject({ code: "no-boundary" });
  expect(mocks.cacheUpsert.mock.calls[0][0].create.results).toEqual([]);
  mocks.cacheFind.mockResolvedValueOnce({ results: [], expiresAt: new Date(Date.now() + 60_000) });
  await expect(selectCity("RELATION", "5326784")).rejects.toMatchObject({ code: "no-boundary" });
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it("rejects point geometries, malformed rings, mismatched IDs, and invalid input", async () => {
  expect(parseBoundary({ type: "Point", coordinates: [-3, 40] })).toBeNull();
  expect(parseBoundary({ type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 41]]] })).toBeNull();
  expect(parseBoundary({ type: "MultiPolygon", coordinates: [boundary.coordinates] })).not.toBeNull();
  expect(parseCandidate({ ...place, osm_id: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  await expect(selectCity("WAY", "0")).rejects.toMatchObject({ code: "invalid" });
  mocks.fetch.mockResolvedValueOnce(Response.json([{ ...place, geojson: { type: "Point", coordinates: [0, 0] } }]));
  await expect(selectCity("RELATION", "5326784")).rejects.toMatchObject({ code: "no-boundary" });
  mocks.fetch.mockResolvedValueOnce(Response.json([{ ...place, osm_id: "1", geojson: boundary }]));
  await expect(selectCity("RELATION", "5326784")).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.cityUpsert).not.toHaveBeenCalled();
});
