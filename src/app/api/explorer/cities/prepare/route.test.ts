import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/city-progress", () => ({ prepareCityTiles: mocks.prepare }));

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
