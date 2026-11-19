import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStravaCooldown } from "./strava-rate";
import { getValidAccessToken, stravaFetch } from "./strava";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findAccount: vi.fn(),
  updateAccount: vi.fn(),
  findLimit: vi.fn(),
  readLockedAccount: vi.fn(),
  writeLimit: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("./db", () => {
  const tx = {
    account: { findFirst: mocks.findAccount, update: mocks.updateAccount },
    stravaRateLimit: { findUnique: mocks.findLimit },
    $queryRaw: mocks.readLockedAccount,
    $executeRaw: mocks.writeLimit,
  };
  return { db: { ...tx, $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

const now = Date.parse("2026-01-08T23:44:00Z");
const account = { id: "account", access_token: "previous", refresh_token: "rotation", expires_at: now / 1000 + 500 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("AUTH_STRAVA_ID", "client");
  vi.stubEnv("AUTH_STRAVA_SECRET", "test-only");
  mocks.findAccount.mockResolvedValue(account);
  mocks.readLockedAccount.mockResolvedValue([account]);
  mocks.findLimit.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Strava quotas", () => {
  it("chooses the later reset across overall and non-upload limits", () => {
    const headers = new Headers({
      "X-RateLimit-Limit": "200,2000",
      "X-RateLimit-Usage": "200,500",
      "X-ReadRateLimit-Limit": "100,1000",
      "X-ReadRateLimit-Usage": "80,1000",
    });
    expect(getStravaCooldown(headers, 200, now)).toEqual(new Date("2026-01-09T00:00:00Z"));
    expect(getStravaCooldown(new Headers(), 429, now)).toEqual(new Date("2026-01-08T23:45:00Z"));
  });

  it("blocks another user after a 429 with Retry-After", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "100" } }));
    await expect(stravaFetch("first", "athlete/activities")).rejects.toMatchObject({ code: "rate-limit" });
    const blockedUntil = new Date(now + 100_000);
    expect(mocks.writeLimit).toHaveBeenCalledWith(expect.anything(), 1, blockedUntil);
    mocks.findLimit.mockResolvedValue({ blockedUntil });
    await expect(stravaFetch("second", "athlete/activities")).rejects.toMatchObject({ code: "rate-limit" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("serves the successful last request before setting the shared cooldown", async () => {
    mocks.fetch.mockResolvedValue(new Response("[]", {
      headers: { "X-ReadRateLimit-Limit": "100,1000", "X-ReadRateLimit-Usage": "100,200" },
    }));
    await expect(stravaFetch("runner", "athlete/activities")).resolves.toEqual([]);
    expect(mocks.writeLimit).toHaveBeenCalledWith(expect.anything(), 1, new Date("2026-01-08T23:45:00Z"));
  });
});

describe("Strava authorization", () => {
  it("reuses a token another worker refreshed after the initial read", async () => {
    mocks.findAccount.mockResolvedValue({ ...account, expires_at: now / 1000 });
    mocks.readLockedAccount.mockResolvedValue([{ ...account, access_token: "newer" }]);
    await expect(getValidAccessToken("runner")).resolves.toBe("newer");
    expect(mocks.readLockedAccount).toHaveBeenCalledWith(expect.anything(), "runner");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rotates both tokens after a 401 and retries once, preserving large activity IDs", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({
        access_token: "replacement",
        refresh_token: "next-rotation",
        expires_at: now / 1000 + 3_600,
      }))
      .mockResolvedValueOnce(new Response('[{"id":9007199254740993}]'));

    await expect(stravaFetch("runner", "/athlete/activities", { page: 2 })).resolves.toEqual([
      { id: "9007199254740993" },
    ]);
    expect(mocks.fetch.mock.calls.map(([url]) => url.pathname)).toEqual([
      "/api/v3/athlete/activities", "/oauth/token", "/api/v3/athlete/activities",
    ]);
    expect(mocks.fetch.mock.calls[0][0].searchParams.get("page")).toBe("2");
    expect(mocks.fetch.mock.calls[1][1].body.get("refresh_token")).toBe("rotation");
    expect(mocks.fetch.mock.calls[2][1].headers.Authorization).toBe(["Bearer", "replacement"].join(" "));
    expect(mocks.updateAccount).toHaveBeenCalledWith({
      where: { userId: "runner", id: "account", provider: "strava" },
      data: { access_token: "replacement", refresh_token: "next-rotation", expires_at: now / 1000 + 3_600 },
    });
  });

  it("reports invalid grant as revoked without writing credentials", async () => {
    const expired = { ...account, expires_at: now / 1000 };
    mocks.findAccount.mockResolvedValue(expired);
    mocks.readLockedAccount.mockResolvedValue([expired]);
    mocks.fetch.mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 }));
    await expect(getValidAccessToken("runner")).rejects.toMatchObject({ code: "revoked" });
    expect(mocks.updateAccount).not.toHaveBeenCalled();
  });
});
