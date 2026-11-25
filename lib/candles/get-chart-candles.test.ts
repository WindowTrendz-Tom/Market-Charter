// synthetic test data, not real prices
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError, type Candle } from "@/lib/data-provider/types";
import { addDays, dateToDailyTs, dayOfWeek } from "@/lib/time/market-calendar";
import { FakeProvider } from "@/test/helpers/fake-provider";
import { MemoryCandleStore } from "@/test/helpers/memory-candle-store";
import { getChartCandles, type ChartCandlesResult } from "./get-chart-candles";

// Wed 2026-11-25 12:00 New York: expected latest complete bar = Tue 2026-11-24.
const NOW = new Date("2026-11-25T17:00:00Z");
const SYMBOL = "AAPL";

function bar(date: string, close = 100): Candle {
  return { ts: dateToDailyTs(date), open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 };
}

/** Weekday bars from `from` to `to`, inclusive. */
function bars(from: string, to: string): Candle[] {
  const out: Candle[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (dayOfWeek(d) !== 0 && dayOfWeek(d) !== 6) out.push(bar(d, 100 + out.length));
  }
  return out;
}

function setup(opts: { delayMs?: number; now?: Date } = {}) {
  const store = new MemoryCandleStore();
  const provider = new FakeProvider(opts.delayMs);
  const now = opts.now ?? NOW;
  const load = (symbol = SYMBOL) => getChartCandles(symbol, "1day", { store, provider, now: () => now });
  return { store, provider, load };
}

function lastDate(result: ChartCandlesResult): string | undefined {
  return result.ok ? result.candles.at(-1)?.ts.slice(0, 10) : undefined;
}

const secondsAgo = (s: number, from = NOW) => new Date(from.getTime() - s * 1000);

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("getChartCandles", () => {
  it("1. empty cache: one backfill call, candles stored, one ok log row", async () => {
    const { store, provider, load } = setup();
    provider.enqueue(bars("2026-11-16", "2026-11-24"));

    const result = await load();

    expect(provider.calls).toEqual([{ symbol: SYMBOL, interval: "1day", from: undefined }]);
    expect(result).toMatchObject({ ok: true, source: "api", stale: false, notice: null });
    expect(result.ok && result.candles).toHaveLength(7);
    expect(await store.getCandles(SYMBOL, "1day")).toHaveLength(7);
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: SYMBOL, interval: "1day", status: "ok", creditsUsed: 1, candlesReceived: 7 });
  });

  it("2. second load right after: zero provider calls, still one log row, served from cache", async () => {
    const { store, provider, load } = setup();
    provider.enqueue(bars("2026-11-16", "2026-11-24"));
    await load();

    const second = await load();

    expect(provider.calls).toHaveLength(1);
    expect(store.logRows()).toHaveLength(1);
    expect(second).toMatchObject({ ok: true, source: "cache", stale: false, notice: null });
    expect(second.ok && second.candles).toHaveLength(7);
  });

  it("3. stale cache: incremental call from the last cached date; the in-progress bar is not stored", async () => {
    const { store, provider, load } = setup();
    store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-20"));
    provider.enqueue(bars("2026-11-20", "2026-11-25"));

    const result = await load();

    expect(provider.calls).toEqual([{ symbol: SYMBOL, interval: "1day", from: "2026-11-20" }]);
    expect(result).toMatchObject({ ok: true, source: "api", stale: false });
    expect(lastDate(result)).toBe("2026-11-24");
    expect(await store.getLatestCandleTs(SYMBOL, "1day")).toBe("2026-11-24T00:00:00.000Z");
    expect(store.logRows()[0]).toMatchObject({ status: "ok", candlesReceived: 4 });

    const repeat = await load();
    expect(provider.calls).toHaveLength(1);
    expect(repeat).toMatchObject({ ok: true, source: "cache" });
    expect(lastDate(repeat)).toBe("2026-11-24");
  });

  it("4. holiday (no new bar): the fetch is logged ok and the repeat makes no call", async () => {
    // Thu 2026-11-26 20:00 New York (Thanksgiving): expected bar 11-26 never arrives.
    const now = new Date("2026-11-27T01:00:00Z");
    const { store, provider, load } = setup({ now });
    store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-25"));
    provider.enqueue([bar("2026-11-25", 150)]);

    const result = await load();

    expect(provider.calls).toEqual([{ symbol: SYMBOL, interval: "1day", from: "2026-11-25" }]);
    expect(result).toMatchObject({ ok: true, source: "api" });
    expect(result.ok && result.candles.at(-1)?.close).toBe(150);
    expect(store.logRows()).toEqual([expect.objectContaining({ status: "ok", creditsUsed: 1, candlesReceived: 1 })]);

    const repeat = await load();
    expect(provider.calls).toHaveLength(1);
    expect(repeat).toMatchObject({ ok: true, source: "cache", stale: false });
  });

  describe("5. minute budget guard", () => {
    const seedMinute = (store: MemoryCandleStore, credits: number) => {
      for (let i = 0; i < credits; i++) {
        store.seedLog({ symbol: "MSFT", interval: "1day", status: "ok", creditsUsed: 1, createdAt: secondsAgo(5 + i) });
      }
    };

    it("with cache: no call, stale cache with a rate_limited notice", async () => {
      const { store, provider, load } = setup();
      store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-20"));
      seedMinute(store, 8);

      const result = await load();

      expect(provider.calls).toHaveLength(0);
      expect(result).toEqual({
        ok: true,
        candles: bars("2026-11-16", "2026-11-20"),
        source: "cache",
        stale: true,
        notice: {
          code: "rate_limited",
          message:
            "Showing cached data. Twelve Data's free-plan limit (8 calls a minute) has been reached. Try again in about a minute.",
        },
      });
      expect(store.logRows()).toHaveLength(8);
    });

    it("without cache: 429 with Retry-After 60 and no new log row", async () => {
      const { store, provider, load } = setup();
      seedMinute(store, 8);

      const result = await load();

      expect(provider.calls).toHaveLength(0);
      expect(result).toEqual({
        ok: false,
        status: 429,
        error: {
          code: "rate_limited",
          message: "Twelve Data's free-plan limit (8 calls a minute) has been reached. Try again in about a minute.",
        },
        retryAfterSeconds: 60,
      });
      expect(store.logRows()).toHaveLength(8);
    });

    it("7 credits in the last minute (and older ones) still allow the call", async () => {
      const { store, provider, load } = setup();
      seedMinute(store, 7);
      store.seedLog({ symbol: "MSFT", interval: "1day", status: "ok", creditsUsed: 5, createdAt: secondsAgo(61) });
      provider.enqueue(bars("2026-11-23", "2026-11-24"));

      const result = await load();

      expect(provider.calls).toHaveLength(1);
      expect(result).toMatchObject({ ok: true, source: "api" });
    });
  });

  it("6. day budget guard: 429 with Retry-After = seconds to the next UTC midnight", async () => {
    const { store, provider, load } = setup();
    store.seedLog({ symbol: "MSFT", interval: "1day", status: "ok", creditsUsed: 400, createdAt: new Date("2026-11-25T01:00:00Z") });
    store.seedLog({ symbol: "MSFT", interval: "1day", status: "ok", creditsUsed: 400, createdAt: new Date("2026-11-25T00:00:00Z") });
    store.seedLog({ symbol: "MSFT", interval: "1day", status: "ok", creditsUsed: 50, createdAt: new Date("2026-11-24T23:59:59Z") });

    const result = await load();

    expect(provider.calls).toHaveLength(0);
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: {
        code: "rate_limited",
        message: "Twelve Data's daily limit (800 calls) has been reached. It resets at midnight UTC (1 pm NZDT / 12 pm NZST).",
      },
      retryAfterSeconds: 7 * 60 * 60,
    });
    expect(store.logRows()).toHaveLength(3);
  });

  describe("7. provider 429", () => {
    const limit = () => new ProviderError("rate_limited", "You have run out of API credits for the current minute.", 429);

    it("empty cache: 429 and a rate_limited log row costing 1 credit", async () => {
      const { store, provider, load } = setup();
      provider.enqueue(limit());

      const result = await load();

      expect(provider.calls).toHaveLength(1);
      expect(result).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" }, retryAfterSeconds: 60 });
      expect(!result.ok && result.error.message).toBe(
        "Twelve Data says the free-plan limit has been reached. Try again in about a minute.",
      );
      expect(store.logRows()).toEqual([
        expect.objectContaining({
          status: "rate_limited",
          creditsUsed: 1,
          message: "You have run out of API credits for the current minute.",
        }),
      ]);
    });

    it("with cache: stale cache with a rate_limited notice", async () => {
      const { store, provider, load } = setup();
      store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-20"));
      provider.enqueue(limit());

      const result = await load();

      expect(result).toMatchObject({
        ok: true,
        source: "cache",
        stale: true,
        notice: {
          code: "rate_limited",
          message: "Showing cached data. Twelve Data says the free-plan limit has been reached. Try again in about a minute.",
        },
      });
      expect(store.logRows()[0]).toMatchObject({ status: "rate_limited", creditsUsed: 1 });
    });
  });

  describe("8. lease held by another request", () => {
    const holdLease = (store: MemoryCandleStore) =>
      store.seedLog({ symbol: SYMBOL, interval: "1day", status: "pending", creditsUsed: 1, createdAt: secondsAgo(10) });

    it("empty cache: 503 busy with Retry-After 3 and no call", async () => {
      const { store, provider, load } = setup();
      holdLease(store);

      const result = await load();

      expect(provider.calls).toHaveLength(0);
      expect(result).toEqual({
        ok: false,
        status: 503,
        error: { code: "busy", message: "AAPL is being loaded by another request. Retrying shortly…" },
        retryAfterSeconds: 3,
      });
      expect(store.logRows()).toHaveLength(1);
    });

    it("with cache: stale cache with a busy notice", async () => {
      const { store, provider, load } = setup();
      store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-20"));
      holdLease(store);

      const result = await load();

      expect(provider.calls).toHaveLength(0);
      expect(result).toMatchObject({
        ok: true,
        source: "cache",
        stale: true,
        notice: { code: "busy", message: "Showing cached data. AAPL is being loaded by another request. Retrying shortly…" },
      });
    });
  });

  it("9. expired lease: the old pending row is expired and a new call is made", async () => {
    const { store, provider, load } = setup();
    store.seedLog({ symbol: SYMBOL, interval: "1day", status: "pending", creditsUsed: 1, createdAt: secondsAgo(61) });
    provider.enqueue(bars("2026-11-16", "2026-11-24"));

    const result = await load();

    expect(provider.calls).toHaveLength(1);
    expect(result).toMatchObject({ ok: true, source: "api" });
    const rows = store.logRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "expired", message: "lease expired" });
    expect(rows[1]).toMatchObject({ status: "ok", creditsUsed: 1 });
  });

  it("10. same-instance concurrency: two loads share one provider call", async () => {
    const { store, provider, load } = setup({ delayMs: 20 });
    provider.enqueue(bars("2026-11-16", "2026-11-24"));

    const [a, b] = await Promise.all([load(), load()]);

    expect(provider.calls).toHaveLength(1);
    expect(a).toMatchObject({ ok: true, source: "api" });
    expect(b).toEqual(a);
    expect(store.logRows()).toHaveLength(1);

    // The in-flight entry is cleared: a later load reads the (now fresh) cache.
    expect(await load()).toMatchObject({ ok: true, source: "cache" });
    expect(provider.calls).toHaveLength(1);
  });

  it("11. not_found with an empty cache: 404 and a not_found log row", async () => {
    const { store, provider, load } = setup();
    provider.enqueue(new ProviderError("not_found", "**symbol** not found: ZZZZ", 400));

    const result = await load("ZZZZ");

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: { code: "not_found", message: 'No US ticker "ZZZZ" was found at Twelve Data.' },
      retryAfterSeconds: null,
    });
    expect(store.logRows()).toEqual([
      expect.objectContaining({ symbol: "ZZZZ", status: "not_found", creditsUsed: 1, message: "**symbol** not found: ZZZZ" }),
    ]);
  });

  it("12. unavailable with cache: stale cache with a provider_unavailable notice; log row error", async () => {
    const { store, provider, load } = setup();
    store.seedCandles(SYMBOL, "1day", bars("2026-11-16", "2026-11-20"));
    provider.enqueue(new ProviderError("unavailable", "Could not reach the data provider"));

    const result = await load();

    expect(result).toMatchObject({
      ok: true,
      source: "cache",
      stale: true,
      notice: { code: "provider_unavailable", message: "Showing cached data. Couldn't reach Twelve Data. Try again shortly." },
    });
    expect(store.logRows()).toEqual([expect.objectContaining({ status: "error", creditsUsed: 1 })]);
  });

  describe("13. store failures never reach the provider", () => {
    const cacheUnavailable = {
      ok: false,
      status: 503,
      error: { code: "cache_unavailable", message: "The price cache (Supabase) isn't reachable right now. Try again shortly." },
      retryAfterSeconds: null,
    };

    it.each(["getLatestCandleTs", "getLastOkFetchAt", "sumCreditsSince", "acquireFetchLease"] as const)(
      "%s fails: 503 cache_unavailable and 0 provider calls",
      async (method) => {
        const { store, provider, load } = setup();
        provider.enqueue(bars("2026-11-16", "2026-11-24"));
        store.failNext(method);

        const result = await load();

        expect(result).toEqual(cacheUnavailable);
        expect(provider.calls).toHaveLength(0);
      },
    );

    it("upsert fails after the call: 503, and the lease row is closed as error (not ok)", async () => {
      const { store, provider, load } = setup();
      provider.enqueue(bars("2026-11-16", "2026-11-24"));
      store.failNext("upsertCandles");

      const result = await load();

      expect(result).toEqual(cacheUnavailable);
      expect(provider.calls).toHaveLength(1);
      expect(store.logRows()).toEqual([expect.objectContaining({ status: "error", creditsUsed: 1, message: "Saving candles failed" })]);
    });
  });

  it("14. completeFetchLease failure after a successful fetch still returns the candles", async () => {
    const { store, provider, load } = setup();
    provider.enqueue(bars("2026-11-16", "2026-11-24"));
    store.failNext("completeFetchLease");

    const result = await load();

    expect(result).toMatchObject({ ok: true, source: "api", stale: false });
    expect(result.ok && result.candles).toHaveLength(7);
    expect(store.logRows()).toEqual([expect.objectContaining({ status: "pending", creditsUsed: 1 })]);
    expect(consoleError).toHaveBeenCalled();
  });

  describe("other provider errors", () => {
    it("forbidden with an empty cache: 403", async () => {
      const { store, provider, load } = setup();
      provider.enqueue(new ProviderError("forbidden", "Not available on your plan", 403));

      const result = await load("BRK.A");

      expect(result).toEqual({
        ok: false,
        status: 403,
        error: { code: "forbidden", message: "BRK.A isn't available on the Twelve Data free plan." },
        retryAfterSeconds: null,
      });
      expect(store.logRows()[0]).toMatchObject({ status: "error", creditsUsed: 1 });
    });

    it.each(["auth", "bad_response"] as const)("%s with an empty cache: 502 provider_error, logged server-side", async (kind) => {
      const { store, provider, load } = setup();
      provider.enqueue(new ProviderError(kind, "x".repeat(600)));

      const result = await load();

      expect(result).toEqual({
        ok: false,
        status: 502,
        error: { code: "provider_error", message: "Twelve Data returned an unexpected error. Check the server logs." },
        retryAfterSeconds: null,
      });
      expect(store.logRows()[0]).toMatchObject({ status: "error", creditsUsed: 1 });
      expect(store.logRows()[0].message).toHaveLength(500);
      expect(consoleError).toHaveBeenCalled();
    });

    it("an unexpected (non-provider) error closes the lease as error and is rethrown", async () => {
      const { store, provider, load } = setup();
      provider.enqueue(new TypeError("boom"));

      await expect(load()).rejects.toThrow("boom");
      expect(store.logRows()).toEqual([expect.objectContaining({ status: "error", creditsUsed: 1 })]);
    });

    it("a successful call that leaves the series empty: 404 not_found", async () => {
      const { store, provider, load } = setup();
      provider.enqueue([bar("2026-11-25")]); // only the in-progress bar, which is not stored

      const result = await load("NEWCO");

      expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
      expect(store.logRows()[0]).toMatchObject({ status: "ok", candlesReceived: 1 });
    });
  });
});
