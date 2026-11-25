import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { CityBoundary } from "./city-lookup-data";
import { cachedRunnableTiles, fetchRunnableTiles, overpassQuery } from "./city-overpass";
import { TILE_ZOOM } from "./tiles";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), fetch: vi.fn() }));
vi.mock("./db", () => ({ db: { $queryRaw: mocks.query, $executeRaw: mocks.execute } }));
const boundary: CityBoundary = { type: "Polygon", coordinates: [[[-3, 40], [-2, 40], [-2, 41], [-3, 41], [-3, 40]]] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("CITY_OVERPASS_URL", "");
  mocks.query.mockResolvedValue([{ leaseId: "lease" }]);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("requests public highways and restriction geometries with identification and bounded HTTP settings", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ elements: [] }));
  expect(await fetchRunnableTiles(boundary)).toEqual({ zoom: TILE_ZOOM, keys: [] });
  const [url, options] = mocks.fetch.mock.calls[0];
  expect(url.href).toBe("https://overpass-api.de/api/interpreter");
  expect(options.method).toBe("POST");
  expect(options.redirect).toBe("error");
  expect(options.headers["User-Agent"]).toContain("OwnPace");
  const query = options.body.get("data");
  expect(query).toBe(overpassQuery(boundary));
  const timeout = Number(query.match(/\[timeout:(\d+)\]/)?.[1]);
  const memory = Number(query.match(/\[maxsize:(\d+)\]/)?.[1]);
  expect(timeout).toBeGreaterThan(0);
  expect(timeout).toBeLessThanOrEqual(25);
  expect(memory).toBeGreaterThan(0);
  expect(memory).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(query).toContain('way["highway"');
  expect(query).not.toContain("motorway");
  expect(query).toContain('rel["landuse"="military"]');
  expect(query).toContain('rel["access"~"^(private|no|military)$"]');
  expect(query).toContain('rel["natural"="water"]');
  expect(query).toContain("out geom;");
  expect(query).toContain("is_in(");
  expect(mocks.execute).toHaveBeenCalledOnce();
});

it("enforces the shared Overpass lease independently of Nominatim", async () => {
  mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ leaseId: "active-lease", retryAfter: 23 }]);
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "busy", retryAfter: 23 });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("respects throttling without saving a fallback mask", async () => {
  mocks.fetch.mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "rate-limit", retryAfter: 120 });
  expect(mocks.execute.mock.calls[0].slice(1, 3)).toEqual(["overpass:rate-limit", 120]);
});

it.each([502, 503, 504])("backs off globally on provider capacity failures (%s)", async (status) => {
  mocks.fetch.mockResolvedValue(new Response("At capacity", { status, headers: { "Retry-After": "90" } }));
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "unavailable", retryAfter: 90 });
  expect(mocks.execute.mock.calls[0].slice(1, 3)).toEqual(["overpass:unavailable", 90]);
});

it.each([new Error("network"), new DOMException("Timeout", "TimeoutError")])("backs off globally after transport failures", async (error) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockRejectedValue(error);
  try {
    await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "unavailable", retryAfter: 60 });
    expect(mocks.execute.mock.calls[0].slice(1, 3)).toEqual(["overpass:unavailable", 60]);
  } finally { log.mockRestore(); }
});

it("retries Overpass query timeouts returned inside HTTP 200 without accepting partial geometry", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockResolvedValue(Response.json({ remark: "runtime error: Query timed out after 20 seconds", elements: [] }));
  try {
    await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "unavailable", retryAfter: 60 });
    expect(mocks.execute.mock.calls[0].slice(1, 3)).toEqual(["overpass:unavailable", 60]);
  } finally { log.mockRestore(); }
});

it.each([
  ["overpass:unavailable", "unavailable"],
  ["overpass:rate-limit", "rate-limit"],
])("reports shared provider cooldown %s as %s instead of active work", async (leaseId, code) => {
  mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ leaseId, retryAfter: 42 }]);
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code, retryAfter: 42 });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it.each([
  () => Promise.resolve(Response.json({ elements: "incomplete" })),
  () => Promise.resolve(new Response("not JSON")),
  () => Promise.resolve(new Response("x".repeat(32 * 1024 * 1024 + 1))),
])("fails explicitly and releases the lease on unusable responses", async (response) => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.fetch.mockImplementation(response);
  try {
    await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "upstream" });
    expect(mocks.execute).toHaveBeenCalledOnce();
  } finally { log.mockRestore(); }
});

it("allows only HTTPS provider URLs and validates stored masks", async () => {
  vi.stubEnv("CITY_OVERPASS_URL", "http://example.test/interpreter");
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "upstream" });
  vi.stubEnv("CITY_OVERPASS_URL", "not a URL");
  await expect(fetchRunnableTiles(boundary)).rejects.toMatchObject({ code: "upstream" });
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(cachedRunnableTiles(null)).toBeNull();
  expect(cachedRunnableTiles({ zoom: TILE_ZOOM, keys: ["1/2"] })).toEqual(new Set(["1/2"]));
  expect(cachedRunnableTiles({ zoom: TILE_ZOOM - 1, keys: ["1/2"] })).toBeNull();
  expect(() => cachedRunnableTiles({ zoom: TILE_ZOOM, keys: ["131072/2"] })).toThrow();
  expect(() => cachedRunnableTiles({ zoom: TILE_ZOOM, keys: ["-1/2"] })).toThrow();
});
