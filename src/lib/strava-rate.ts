const QUARTER_HOUR = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

function counters(headers: Headers, name: string) {
  return (headers.get(name) ?? "").split(",").map((value) =>
    /^\d+$/.test(value.trim()) ? Number(value) : undefined,
  );
}

export function getStravaCooldown(headers: Headers, status: number, now: number) {
  const nextQuarter = (Math.floor(now / QUARTER_HOUR) + 1) * QUARTER_HOUR;
  const nextDay = (Math.floor(now / DAY) + 1) * DAY;
  let until = 0;

  // Reads can hit either the overall or the non-upload quota.
  for (const prefix of ["X-RateLimit", "X-ReadRateLimit"]) {
    const [shortLimit, dailyLimit] = counters(headers, `${prefix}-Limit`);
    const [shortUsage, dailyUsage] = counters(headers, `${prefix}-Usage`);
    if (shortLimit !== undefined && shortUsage !== undefined && shortUsage >= shortLimit) {
      until = Math.max(until, nextQuarter);
    }
    if (dailyLimit !== undefined && dailyUsage !== undefined && dailyUsage >= dailyLimit) {
      until = Math.max(until, nextDay);
    }
  }

  if (status === 429) {
    const retry = headers.get("Retry-After")?.trim();
    const retryAt = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? "");
    if (Number.isFinite(retryAt) && retryAt > now && retryAt <= 8.64e15) {
      until = Math.max(until, retryAt);
    }
    if (!until) until = nextQuarter;
  }

  return until ? new Date(until) : null;
}
