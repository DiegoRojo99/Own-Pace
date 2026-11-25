import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { CityWalkabilityError } from "@/lib/city-overpass";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/city-progress", () => ({ prepareCityTiles: mocks.prepare }));
vi.mock("@/lib/city-overpass", () => ({
  CityWalkabilityError: class CityWalkabilityError extends Error { constructor(public code: string) { super(code); } },
}));

function request(origin = "https://own.example") {
  return new Request("https://own.example/api/explorer/cities/prepare?cityId=city1", { method: "POST", headers: { origin } });
}

beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "owner" } }); });

it("requires authentication and same-origin requests", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await POST(request())).status).toBe(401);
  expect((await POST(request("https://other.example"))).status).toBe(403);
  expect(mocks.prepare).not.toHaveBeenCalled();
});

it("scopes preparation to the signed-in user and rejects untracked cities", async () => {
  mocks.prepare.mockResolvedValueOnce(null).mockResolvedValueOnce({ done: true });
  expect((await POST(request())).status).toBe(404);
  expect(await (await POST(request())).json()).toEqual({ done: true });
  expect(mocks.prepare).toHaveBeenCalledWith("owner", "city1");
});

it("surfaces Overpass failures without returning successful preparation", async () => {
  mocks.prepare.mockRejectedValueOnce(new CityWalkabilityError("rate-limit"));
  expect((await POST(request())).status).toBe(429);
  mocks.prepare.mockRejectedValueOnce(new CityWalkabilityError("upstream"));
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain("No unfiltered tiles were saved");
});
