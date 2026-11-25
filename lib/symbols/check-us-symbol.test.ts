// synthetic test data, not real prices
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMIT_MESSAGES } from "@/lib/candles/messages";
import { ProviderError, type SymbolMatch } from "@/lib/data-provider/types";
import { FakeProvider } from "@/test/helpers/fake-provider";
import { MemoryCandleStore } from "@/test/helpers/memory-candle-store";
import { checkUsSymbol } from "./check-us-symbol";

const NOW = new Date("2026-11-25T17:00:00Z");
const SYMBOL = "AAPL";

const match = (o: Partial<SymbolMatch>): SymbolMatch => ({
  symbol: SYMBOL,
  name: "Apple Inc",
  exchange: "NASDAQ",
  micCode: "XNGS",
  country: "United States",
  instrumentType: "Common Stock",
  currency: "USD",
  ...o,
});

const US_AAPL = match({});
const MX_AAPL = match({ exchange: "BMV", micCode: "XMEX", country: "Mexico", currency: "MXN" });
const US_APLE = match({ symbol: "APLE", exchange: "NYSE", micCode: "XNYS", instrumentType: "REIT" });

function setup() {
  const store = new MemoryCandleStore();
  const provider = new FakeProvider();
  const check = (symbol = SYMBOL) => checkUsSymbol(symbol, { store, provider, now: () => NOW });
  return { store, provider, check };
}

describe("checkUsSymbol", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a US listing and logs one ok symbol_search row with 1 credit", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([US_AAPL, MX_AAPL, US_APLE]);

    const result = await check();

    expect(result).toEqual({ ok: true, match: US_AAPL });
    expect(provider.searchCalls).toEqual([SYMBOL]);
    expect(provider.calls).toHaveLength(0);
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      symbol: SYMBOL,
      interval: "symbol_search",
      status: "ok",
      creditsUsed: 1,
      candlesReceived: null,
      message: null,
      completedAt: NOW,
    });
  });

  it("returns 404 not_found when there is no exact match, logging the match summary", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([US_APLE]);

    const result = await check("APL");

    expect(result).toEqual({
      ok: false,
      status: 404,
      error: { code: "not_found", message: 'No US-listed ticker "APL" was found at Twelve Data.' },
      retryAfterSeconds: null,
    });
    expect(provider.searchCalls).toEqual(["APL"]);
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ interval: "symbol_search", status: "not_found", creditsUsed: 1 });
    expect(rows[0].message).toBe("APLE@NYSE(United States)");
  });

  it("returns 404 with 'no matches' logged for an empty result", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([]);

    const result = await check("ZZZZQX");

    expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
    expect(store.logRows()[0]).toMatchObject({ status: "not_found", message: "no matches", creditsUsed: 1 });
  });

  it("returns 422 not_us when the exact match is listed only outside the US", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([MX_AAPL]);

    const result = await check();

    expect(result).toMatchObject({ ok: false, status: 422, error: { code: "not_us" }, retryAfterSeconds: null });
    if (result.ok) throw new Error("expected a failure");
    expect(result.error.message).toBe(
      "AAPL isn't listed on a US exchange (found on BMV). Only US tickers are supported.",
    );
    expect(provider.searchCalls).toHaveLength(1);
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      interval: "symbol_search",
      status: "not_found",
      creditsUsed: 1,
      message: "non-US only: AAPL@BMV(Mexico)",
    });
  });

  it("treats a provider not_found error as no matches (404, one not_found row)", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch(new ProviderError("not_found", "Symbol not found", 404));

    const result = await check();

    expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
    expect(provider.searchCalls).toHaveLength(1);
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "not_found", creditsUsed: 1, message: "no matches" });
  });

  it("refuses with 429 when the minute budget is full: no provider call, no new row", async () => {
    const { store, provider, check } = setup();
    for (let i = 0; i < 8; i++) {
      store.seedLog({
        symbol: `S${i}`,
        interval: "1day",
        status: "ok",
        creditsUsed: 1,
        createdAt: new Date(NOW.getTime() - (i + 1) * 5_000),
      });
    }

    const result = await check();

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: LIMIT_MESSAGES.minute },
      retryAfterSeconds: 60,
    });
    expect(provider.searchCalls).toHaveLength(0);
    expect(store.logRows()).toHaveLength(8);
  });

  it("maps a provider 429 to 429 rate_limited and logs rate_limited with 1 credit", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch(new ProviderError("rate_limited", "You have run out of API credits for the current minute.", 429));

    const result = await check();

    expect(result).toEqual({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: LIMIT_MESSAGES.provider },
      retryAfterSeconds: 60,
    });
    const rows = store.logRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      interval: "symbol_search",
      status: "rate_limited",
      creditsUsed: 1,
      candlesReceived: null,
      message: "You have run out of API credits for the current minute.",
    });
  });

  it("returns 503 busy when another search for the symbol holds the lease", async () => {
    const { store, provider, check } = setup();
    store.seedLog({
      symbol: SYMBOL,
      interval: "symbol_search",
      status: "pending",
      creditsUsed: 1,
      createdAt: new Date(NOW.getTime() - 10_000),
    });

    const result = await check();

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: { code: "busy", message: "AAPL is already being checked. Try again in a moment." },
      retryAfterSeconds: 3,
    });
    expect(provider.searchCalls).toHaveLength(0);
    expect(store.logRows()).toHaveLength(1);
  });

  it("is not blocked by a pending 1day candle lease for the same symbol", async () => {
    const { store, provider, check } = setup();
    store.seedLog({
      symbol: SYMBOL,
      interval: "1day",
      status: "pending",
      creditsUsed: 1,
      createdAt: new Date(NOW.getTime() - 10_000),
    });
    provider.enqueueSearch([US_AAPL]);

    const result = await check();

    expect(result.ok).toBe(true);
    expect(provider.searchCalls).toHaveLength(1);
    const rows = store.logRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ interval: "1day", status: "pending" });
    expect(rows[1]).toMatchObject({ interval: "symbol_search", status: "ok" });
  });

  it("maps provider unavailable to 502 provider_unavailable", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch(new ProviderError("unavailable", "Data provider request timed out", null));

    const result = await check();

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: {
        code: "provider_unavailable",
        message: "Couldn't reach Twelve Data to check the ticker. Try again shortly.",
      },
      retryAfterSeconds: null,
    });
    expect(store.logRows()[0]).toMatchObject({ status: "error", creditsUsed: 1, message: "Data provider request timed out" });
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["bad_response", "forbidden", "auth"] as const)(
    "maps provider %s to 502 provider_error and logs it to the console",
    async (kind) => {
      const { store, provider, check } = setup();
      provider.enqueueSearch(new ProviderError(kind, "Data provider returned an unexpected response", 200));

      const result = await check();

      expect(result).toEqual({
        ok: false,
        status: 502,
        error: {
          code: "provider_error",
          message: "Twelve Data returned an unexpected error while checking the ticker. Check the server logs.",
        },
        retryAfterSeconds: null,
      });
      expect(store.logRows()[0]).toMatchObject({ interval: "symbol_search", status: "error", creditsUsed: 1 });
      expect(console.error).toHaveBeenCalledTimes(1);
    },
  );

  it("cuts long provider messages to 500 characters in the log", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch(new ProviderError("unavailable", "x".repeat(800), 500));

    await check();

    expect(store.logRows()[0].message).toHaveLength(500);
  });

  it("closes the lease as error and rethrows a non-provider error", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch(new TypeError("boom"));

    await expect(check()).rejects.toThrow("boom");

    expect(store.logRows()[0]).toMatchObject({
      interval: "symbol_search",
      status: "error",
      creditsUsed: 1,
      message: "Unexpected data provider failure",
    });
  });

  it("returns 503 cache_unavailable when the budget read fails, with no provider call", async () => {
    const { store, provider, check } = setup();
    store.failNext("sumCreditsSince");

    const result = await check();

    expect(result).toEqual({
      ok: false,
      status: 503,
      error: {
        code: "cache_unavailable",
        message: "The price cache (Supabase) isn't reachable right now. Try again shortly.",
      },
      retryAfterSeconds: null,
    });
    expect(provider.searchCalls).toHaveLength(0);
    expect(store.logRows()).toHaveLength(0);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("still returns the result when completing the lease fails", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([US_AAPL]);
    store.failNext("completeFetchLease");

    const result = await check();

    expect(result).toEqual({ ok: true, match: US_AAPL });
    expect(store.logRows()[0]).toMatchObject({ interval: "symbol_search", status: "pending" });
  });

  it("an ok search row does not make the 1day candle series look fresh", async () => {
    const { store, provider, check } = setup();
    provider.enqueueSearch([US_AAPL]);

    await check();

    expect(store.logRows()[0]).toMatchObject({ interval: "symbol_search", status: "ok" });
    await expect(store.getLastOkFetchAt(SYMBOL, "1day")).resolves.toBeNull();
  });
});
