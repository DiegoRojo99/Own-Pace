import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { CityLookupError } from "@/lib/city-lookup";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn(), findMany: vi.fn(), findCity: vi.fn(), catalog: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {
  userCity: { upsert: mocks.upsert, deleteMany: mocks.remove },
  city: { findMany: mocks.findMany, findUnique: mocks.findCity },
} }));
vi.mock("@/lib/city-catalog", () => ({ precomputedCity: mocks.catalog }));
vi.mock("@/lib/city-lookup", () => ({
  CityLookupError: class CityLookupError extends Error { constructor(public code: string) { super(code); } },
  searchCities: mocks.search,
}));

function request(body: unknown, origin = "https://own.example") {
  return new Request("https://own.example/api/explorer/cities", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
  mocks.catalog.mockReturnValue({ fingerprint: "catalog" });
});

it("requires authentication and same-origin requests", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(request({ action: "search", query: "Madrid" }))).status).toBe(401);
  expect((await POST(request({ action: "search", query: "Madrid" }, "https://other.example"))).status).toBe(403);
  expect(mocks.search).not.toHaveBeenCalled();
});

it("searches and selects only on explicit authenticated requests", async () => {
  mocks.search.mockResolvedValue([{ osmType: "RELATION", osmId: "42", name: "Madrid", label: "Madrid, Spain" }]);
  mocks.findMany.mockResolvedValue([{ osmType: "RELATION", osmId: 42n, boundary: {} }]);
  const search = await POST(request({ action: "search", query: "Madrid" }));
  expect(await search.json()).toEqual({ results: [{ osmType: "RELATION", osmId: "42", name: "Madrid", label: "Madrid, Spain" }] });
  expect(search.headers.get("cache-control")).toBe("private, no-store");
  mocks.findCity.mockResolvedValue({ id: "city1", name: "Madrid", osmType: "RELATION", osmId: 42n, boundary: {} });
  expect((await POST(request({ action: "select", osmType: "RELATION", osmId: "42", label: "Madrid, Spain" }))).status).toBe(200);
  expect(mocks.findCity).toHaveBeenCalledWith({ where: { osmType_osmId: { osmType: "RELATION", osmId: 42n } } });
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId_cityId: { userId: "owner", cityId: "city1" } },
    create: { userId: "owner", cityId: "city1", label: "Madrid, Spain" },
  }));
  expect((await POST(request({ action: "remove", cityId: "city1" }))).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { userId: "owner", cityId: "city1" } });
  expect((await POST(request({ action: "select", osmType: "NODE", osmId: "42" }))).status).toBe(400);
});

it("filters unavailable search results and refuses direct selection of a stale catalog", async () => {
  mocks.search.mockResolvedValue([{ osmType: "RELATION", osmId: "42", name: "Madrid", label: "Madrid" }]);
  mocks.findMany.mockResolvedValue([{ osmType: "RELATION", osmId: 42n, boundary: {} }]);
  mocks.findCity.mockResolvedValue({ id: "city1", name: "Madrid", osmType: "RELATION", osmId: 42n, boundary: {} });
  mocks.catalog.mockReturnValue(null);
  expect(await (await POST(request({ action: "search", query: "Madrid" }))).json()).toEqual({ results: [] });
  const response = await POST(request({ action: "select", osmType: "RELATION", osmId: "42", label: "Madrid" }));
  expect(response.status).toBe(422);
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it("returns rate-limit and malformed-input errors without exposing details", async () => {
  mocks.search.mockRejectedValueOnce(new CityLookupError("rate-limit"));
  const limited = await POST(request({ action: "search", query: "Madrid" }));
  expect(limited.status).toBe(429);
  expect((await limited.json()).error).toContain("rate-limited");
  expect((await POST(request({ action: "search", query: "x".repeat(5000) }))).status).toBe(400);
});
