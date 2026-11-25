import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { CityLookupError } from "@/lib/city-lookup";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn(), select: vi.fn(), upsert: vi.fn(), remove: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { userCity: { upsert: mocks.upsert, deleteMany: mocks.remove } } }));
vi.mock("@/lib/city-lookup", () => ({
  CityLookupError: class CityLookupError extends Error { constructor(public code: string) { super(code); } },
  searchCities: mocks.search, selectCity: mocks.select,
}));

function request(body: unknown, origin = "https://own.example") {
  return new Request("https://own.example/api/explorer/cities", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" } });
});

it("requires authentication and same-origin requests", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(request({ action: "search", query: "Madrid" }))).status).toBe(401);
  expect((await POST(request({ action: "search", query: "Madrid" }, "https://other.example"))).status).toBe(403);
  expect(mocks.search).not.toHaveBeenCalled();
});

it("searches and selects only on explicit authenticated requests", async () => {
  mocks.search.mockResolvedValue([{ osmType: "RELATION", osmId: "42", name: "Madrid", label: "Madrid, Spain" }]);
  const search = await POST(request({ action: "search", query: "Madrid" }));
  expect(await search.json()).toEqual({ results: [{ osmType: "RELATION", osmId: "42", name: "Madrid", label: "Madrid, Spain" }] });
  expect(search.headers.get("cache-control")).toBe("private, no-store");
  mocks.select.mockResolvedValue({ id: "city1", name: "Madrid" });
  expect((await POST(request({ action: "select", osmType: "RELATION", osmId: "42", label: "Madrid, Spain" }))).status).toBe(200);
  expect(mocks.select).toHaveBeenCalledWith("RELATION", "42");
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId_cityId: { userId: "owner", cityId: "city1" } },
    create: { userId: "owner", cityId: "city1", label: "Madrid, Spain" },
  }));
  expect((await POST(request({ action: "remove", cityId: "city1" }))).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { userId: "owner", cityId: "city1" } });
  expect((await POST(request({ action: "select", osmType: "NODE", osmId: "42" }))).status).toBe(400);
});

it("offers and saves cities even when they have no precomputed catalog", async () => {
  const place = { osmType: "WAY", osmId: "123", name: "New Town", label: "New Town, Country" };
  mocks.search.mockResolvedValue([place]);
  expect(await (await POST(request({ action: "search", query: "New Town" }))).json()).toEqual({ results: [place] });
  mocks.select.mockResolvedValue({ id: "newcity", name: "New Town" });
  const response = await POST(request({ action: "select", osmType: "WAY", osmId: "123", label: place.label }));
  expect(response.status).toBe(200);
  expect(mocks.select).toHaveBeenCalledWith("WAY", "123");
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
    create: { userId: "owner", cityId: "newcity", label: place.label },
  }));
});

it("does not save a city if Nominatim cannot provide its administrative boundary", async () => {
  mocks.select.mockRejectedValue(new CityLookupError("no-boundary"));
  const response = await POST(request({ action: "select", osmType: "RELATION", osmId: "42", label: "City" }));
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
