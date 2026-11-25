import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareCityUntilReady } from "./city-preparation";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("waits for shared work, then continues normal resumable batches", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ done: false, message: "Waiting for another city" }, {
    status: 202, headers: { "Retry-After": "7" },
  })).mockResolvedValueOnce(Response.json({ done: false }))
    .mockResolvedValueOnce(Response.json({ done: true }));
  const controller = new AbortController();
  const status = vi.fn();
  const pending = prepareCityUntilReady("city 1", controller.signal, status);
  await vi.advanceTimersByTimeAsync(6999);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(status).toHaveBeenCalledWith("Waiting for another city Checking again in 7 seconds.");
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(149);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock).toHaveBeenCalledWith("/api/explorer/cities/prepare?cityId=city%201", { method: "POST", signal: controller.signal });
});

it("honors provider Retry-After headers and increases the delay on repeated failures", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503, headers: { "Retry-After": "60" } }))
    .mockResolvedValueOnce(Response.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": "120" } }))
    .mockResolvedValueOnce(Response.json({ done: true }));
  const status = vi.fn();
  const pending = prepareCityUntilReady("city", new AbortController().signal, status);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(fetchMock).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(239_999);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await pending;
  expect(status.mock.calls.map(([message]) => message)).toEqual([
    "Unavailable Retrying in 60 seconds (1/3).",
    "Rate limited Retrying in 240 seconds (2/3).",
  ]);
});

it("stops automatic retries and surfaces persistent outages after three retries", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({ error: "Still unavailable" }, {
    status: 503, headers: { "Retry-After": "60" },
  })));
  const pending = prepareCityUntilReady("city", new AbortController().signal, vi.fn());
  const failure = expect(pending).rejects.toThrow("Still unavailable");
  await vi.runAllTimersAsync();
  await failure;
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("stops retrying when other cities repeatedly encounter shared provider cooldowns", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({ error: "Service unavailable" }, {
    status: 503, headers: { "Retry-After": "42" },
  })));
  const pending = prepareCityUntilReady("waiting-city", new AbortController().signal, vi.fn());
  const failure = expect(pending).rejects.toThrow("Service unavailable");
  await vi.runAllTimersAsync();
  await failure;
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("does not consume provider retries while other users hold the shared lease", async () => {
  for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(Response.json({ done: false }, {
    status: 202, headers: { "Retry-After": "1" },
  }));
  fetchMock.mockResolvedValueOnce(Response.json({ done: true }));
  const pending = prepareCityUntilReady("city", new AbortController().signal, vi.fn());
  await vi.runAllTimersAsync();
  await pending;
  expect(fetchMock).toHaveBeenCalledTimes(6);
});

it("cancels a pending retry when the card unmounts without making another request", async () => {
  fetchMock.mockResolvedValue(Response.json({ done: false }, { status: 202, headers: { "Retry-After": "30" } }));
  const controller = new AbortController();
  const pending = prepareCityUntilReady("city", controller.signal, vi.fn());
  const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await failure;
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each([
  () => Response.json({ error: "Invalid city data" }, { status: 502 }),
  () => Response.json({ unexpected: true }),
])("does not retry invalid data or non-transient errors", async (response) => {
  fetchMock.mockResolvedValue(response());
  await expect(prepareCityUntilReady("city", new AbortController().signal, vi.fn())).rejects.toThrow();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
