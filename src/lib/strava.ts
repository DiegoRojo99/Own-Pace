import "server-only";
import { db } from "./db";
import { getStravaCooldown } from "./strava-rate";

type StravaErrorCode = "rate-limit" | "revoked" | "upstream";

const errorMessages: Record<StravaErrorCode, string> = {
  "rate-limit": "Strava's request limit has been reached. Try again later.",
  revoked: "Reconnect your Strava account.",
  upstream: "Strava is temporarily unavailable.",
};

export class StravaError extends Error {
  constructor(public readonly code: StravaErrorCode) {
    super(errorMessages[code]);
    this.name = "StravaError";
  }
}

const STRAVA_ORIGIN = "https://www.strava.com";
const RATE_LIMIT_ID = 1;
const HTTP_TIMEOUT_MS = 4_000;
const EXPIRY_SKEW_SECONDS = 300;

type TokenFields = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

type RefreshPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
};

type RefreshFailure = {
  error?: string;
  errors?: { field?: string; code?: string }[];
};

const accountFilter = (userId: string) => ({ userId, provider: "strava" });

function usableAccessToken(account: TokenFields | null, rejectedToken?: string) {
  const token = account?.access_token;
  const minExpiry = Math.floor(Date.now() / 1000) + EXPIRY_SKEW_SECONDS;
  return token && token !== rejectedToken && (account?.expires_at ?? 0) > minExpiry ? token : null;
}

async function checkCooldown(client: Pick<typeof db, "stravaRateLimit">) {
  const limit = await client.stravaRateLimit.findUnique({ where: { id: RATE_LIMIT_ID } });
  if (limit && limit.blockedUntil.getTime() > Date.now()) {
    throw new StravaError("rate-limit");
  }
}

async function recordCooldown(client: Pick<typeof db, "$executeRaw">, response: Response) {
  const blockedUntil = getStravaCooldown(response.headers, response.status, Date.now());
  if (!blockedUntil) return;

  // An older/concurrent response must not shorten a cooldown another worker set.
  await client.$executeRaw`
    INSERT INTO "StravaRateLimit" ("id", "blockedUntil")
    VALUES (${RATE_LIMIT_ID}, ${blockedUntil})
    ON CONFLICT ("id") DO UPDATE SET "blockedUntil" =
      GREATEST("StravaRateLimit"."blockedUntil", EXCLUDED."blockedUntil")
  `;
}

async function request(url: URL, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
  } catch {
    throw new StravaError("upstream");
  }
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    const parse = JSON.parse as (
      text: string,
      reviver: (key: string, value: unknown, context?: { source?: string }) => unknown,
    ) => T;
    return parse(await response.text(), (key, value, context) =>
      key === "id" && typeof value === "number" && !Number.isSafeInteger(value)
        ? context?.source
        : value,
    );
  } catch {
    throw new StravaError("upstream");
  }
}

async function refreshWasRevoked(response: Response) {
  if (response.status !== 400 && response.status !== 401) return false;
  const body = await readJson<RefreshFailure | null>(response).catch(() => null);
  return body?.error === "invalid_grant"
    || (Array.isArray(body?.errors) && body.errors.some((error) =>
      error?.field === "refresh_token" && (error.code === "invalid" || error.code === "revoked"),
    ))
    || (response.status === 401 && body?.error !== "invalid_client");
}

async function refreshAccessToken(userId: string, rejectedToken?: string) {
  try {
    const result = await db.$transaction(async (tx) => {
      // Re-read under lock so only one worker uses any given rotating refresh token.
      const [account] = await tx.$queryRaw<TokenFields[]>`
        SELECT "id", "access_token", "refresh_token", "expires_at"
        FROM "Account"
        WHERE "userId" = ${userId} AND "provider" = 'strava'
        ORDER BY "id" LIMIT 1 FOR UPDATE
      `;
      const currentToken = usableAccessToken(account ?? null, rejectedToken);
      if (currentToken) return currentToken;
      if (!account?.refresh_token) throw new StravaError("revoked");

      const clientId = process.env.AUTH_STRAVA_ID;
      const clientSecret = process.env.AUTH_STRAVA_SECRET;
      if (!clientId || !clientSecret) throw new StravaError("upstream");

      await checkCooldown(tx);
      const response = await request(new URL("/oauth/token", STRAVA_ORIGIN), {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: account.refresh_token,
        }),
      });

      if (!response.ok) {
        await recordCooldown(tx, response);
        // Return the error so any cooldown update commits before reporting it.
        if (response.status === 429) return new StravaError("rate-limit");
        return new StravaError(await refreshWasRevoked(response) ? "revoked" : "upstream");
      }

      const data = await readJson<RefreshPayload | null>(response);
      if (!data || typeof data.access_token !== "string" || !data.access_token
        || typeof data.refresh_token !== "string" || !data.refresh_token
        || typeof data.expires_at !== "number" || !Number.isInteger(data.expires_at)
        || data.expires_at <= Math.floor(Date.now() / 1000) || data.expires_at > 2_147_483_647) {
        throw new StravaError("upstream");
      }

      await tx.account.update({
        where: { id: account.id, ...accountFilter(userId) },
        data: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        },
      });
      await recordCooldown(tx, response);
      return data.access_token;
    }, { timeout: 10_000 });

    if (result instanceof StravaError) throw result;
    return result;
  } catch (error) {
    // Avoid propagating database errors that could include token values.
    throw error instanceof StravaError ? error : new StravaError("upstream");
  }
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await db.account.findFirst({
    where: accountFilter(userId),
    orderBy: { id: "asc" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new StravaError("revoked");
  return usableAccessToken(account) ?? refreshAccessToken(userId);
}

export function stravaIdToPath(id: bigint): string {
  return id.toString(10);
}

type StravaParams = Record<string, string | number | boolean | undefined>;

export async function stravaFetch<T>(userId: string, path: string, params?: StravaParams): Promise<T> {
  const url = new URL(`/api/v3/${path.replace(/^\/+/, "")}`, STRAVA_ORIGIN);
  if (url.origin !== STRAVA_ORIGIN || !url.pathname.startsWith("/api/v3/")) {
    throw new StravaError("upstream");
  }
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const fetchWithToken = async (token: string) => {
    await checkCooldown(db);
    const response = await request(url, { headers: { Authorization: ["Bearer", token].join(" ") } });
    await recordCooldown(db, response);
    return response;
  };

  await checkCooldown(db);
  const token = await getValidAccessToken(userId);
  let response = await fetchWithToken(token);
  if (response.status === 401) {
    response = await fetchWithToken(await refreshAccessToken(userId, token));
  }

  if (response.status === 401) throw new StravaError("revoked");
  if (response.status === 429) throw new StravaError("rate-limit");
  if (!response.ok) throw new StravaError("upstream");
  return readJson<T>(response);
}
