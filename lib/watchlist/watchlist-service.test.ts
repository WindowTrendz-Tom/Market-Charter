// synthetic test data, not real prices
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Candle, SymbolMatch } from "@/lib/data-provider/types";
import { dateToDailyTs } from "@/lib/time/market-calendar";
import { FakeProvider } from "@/test/helpers/fake-provider";
import { MemoryCandleStore } from "@/test/helpers/memory-candle-store";
import { MemoryWatchlistStore } from "@/test/helpers/memory-watchlist-store";
import { MAX_WATCHLIST_ITEMS } from "./limits";
import {
  addToWatchlist,
  listWatchlist,
  refreshWatchlistSymbol,
  removeFromWatchlist,
  reorderWatchlist,
  type WatchlistDeps,
} from "./watchlist-service";

// Wed 2026-11-25 12:00 New York: expected latest complete bar = Tue 2026-11-24.
const NOW = new Date("2026-11-25T17:00:00Z");

const bar = (date: string, close: number): Candle => ({
  ts: dateToDailyTs(date),
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume: 1000,
});

const usMatch = (symbol: string, o: Partial<SymbolMatch> = {}): SymbolMatch => ({
  symbol,
  name: `${symbol} Test Inc`,
  exchange: "NASDAQ",
  micCode: "XNGS",
  country: "United States",
  instrumentType: "Common Stock",
  currency: "USD",
  ...o,
});

function setup() {
  const watchlist = new MemoryWatchlistStore();
  const candles = new MemoryCandleStore();
  const provider = new FakeProvider();
  const deps: WatchlistDeps = { watchlist, candles, provider, now: () => NOW };
  return { watchlist, candles, provider, deps };
}

async function seedRows(watchlist: MemoryWatchlistStore, rows: [string, number][]) {
  for (const [symbol, sortOrder] of rows) await watchlist.insert(symbol, sortOrder);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("listWatchlist", () => {
  it("1. returns rows in sortOrder with cached quotes, null for cold tickers, and the stale flag", async () => {
    const { watchlist, candles, provider, deps } = setup();
    await seedRows(watchlist, [
      ["LSTB", 2],
      ["LSTA", 0],
      ["LSTC", 1],
    ]);
    candles.seedCandles("LSTA", "1day", [bar("2026-11-20", 90), bar("2026-11-23", 100), bar("2026-11-24", 102)]);
    candles.seedCandles("LSTC", "1day", [bar("2026-11-20", 50), bar("2026-11-23", 49)]);

    const result = await listWatchlist(deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map((i) => i.symbol)).toEqual(["LSTA", "LSTC", "LSTB"]);
    const [a, c, b] = result.items;
    expect(a.quote).toMatchObject({ lastClose: 102, prevClose: 100, stale: false });
    expect(a.quote?.changePct).toBeCloseTo(2, 10);
    expect(c.quote).toMatchObject({ lastClose: 49, prevClose: 50, stale: true });
    expect(b.quote).toBeNull();
    expect(provider.calls).toHaveLength(0);
    expect(provider.searchCalls).toHaveLength(0);
  });

  it("15. a watchlist store failure gives 503 cache_unavailable", async () => {
    const { watchlist, deps } = setup();
    watchlist.failNext("list");
    const result = await listWatchlist(deps);
    expect(result).toMatchObject({ ok: false, status: 503, error: { code: "cache_unavailable" } });
  });

  it("a candle cache failure while reading quotes gives 503 cache_unavailable", async () => {
    const { watchlist, candles, deps } = setup();
    await seedRows(watchlist, [["LSTF", 0]]);
    candles.failNext("getRecentCandles");
    const result = await listWatchlist(deps);
    expect(result).toMatchObject({ ok: false, status: 503, error: { code: "cache_unavailable" } });
  });
});

describe("addToWatchlist", () => {
  it("2. checks the symbol (1 search), saves at max+1 and returns the cached quote with no candle calls", async () => {
    const { watchlist, candles, provider, deps } = setup();
    await seedRows(watchlist, [
      ["ADDX", 0],
      ["ADDY", 4],
    ]);
    candles.seedCandles("ADDA", "1day", [bar("2026-11-23", 10), bar("2026-11-24", 11)]);
    provider.enqueueSearch([usMatch("ADDA")]);

    const result = await addToWatchlist(" adda ", deps);

    expect(provider.searchCalls).toEqual(["ADDA"]);
    expect(provider.calls).toHaveLength(0);
    expect(result).toMatchObject({ ok: true, item: { symbol: "ADDA", quote: { lastClose: 11, prevClose: 10, stale: false } } });
    expect(watchlist.rows().at(-1)).toEqual({ symbol: "ADDA", sortOrder: 5 });
    expect(candles.logRows()).toMatchObject([{ symbol: "ADDA", interval: "symbol_search", status: "ok", creditsUsed: 1 }]);
  });

  it("2b. the first ticker gets sortOrder 0 and a cold ticker has a null quote", async () => {
    const { watchlist, provider, deps } = setup();
    provider.enqueueSearch([usMatch("ADDF")]);
    const result = await addToWatchlist("ADDF", deps);
    expect(result).toEqual({ ok: true, item: { symbol: "ADDF", quote: null } });
    expect(watchlist.rows()).toEqual([{ symbol: "ADDF", sortOrder: 0 }]);
  });

  it.each([["a;b"], [42], ["A".repeat(21)], [null], [""]])("3. invalid symbol %j gives 400 with no calls", async (raw) => {
    const { watchlist, provider, deps } = setup();
    const result = await addToWatchlist(raw, deps);
    expect(result).toMatchObject({ ok: false, status: 400, error: { code: "invalid_symbol" }, retryAfterSeconds: null });
    expect(provider.searchCalls).toHaveLength(0);
    expect(watchlist.rows()).toHaveLength(0);
  });

  it("3b. the invalid-symbol message quotes the raw input", async () => {
    const { deps } = setup();
    const result = await addToWatchlist(42, deps);
    expect(!result.ok && result.error.message).toContain('"42"');
  });

  it("4. a duplicate gives 409 with no calls", async () => {
    const { watchlist, provider, deps } = setup();
    await seedRows(watchlist, [["DUPA", 0]]);
    const result = await addToWatchlist("dupa", deps);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: { code: "duplicate", message: "DUPA is already in your watchlist." },
      retryAfterSeconds: null,
    });
    expect(provider.searchCalls).toHaveLength(0);
  });

  it("5. a full watchlist gives 409 watchlist_full with no calls", async () => {
    const { watchlist, provider, deps } = setup();
    await seedRows(
      watchlist,
      Array.from({ length: MAX_WATCHLIST_ITEMS }, (_, i): [string, number] => [`FULL${i}`, i]),
    );
    const result = await addToWatchlist("FULLX", deps);
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: { code: "watchlist_full", message: "Your watchlist is full (30 tickers). Remove one first." },
      retryAfterSeconds: null,
    });
    expect(provider.searchCalls).toHaveLength(0);
  });

  it("6. no exact match gives 404 and nothing is inserted", async () => {
    const { watchlist, provider, deps } = setup();
    provider.enqueueSearch([usMatch("NFXX")]);
    const result = await addToWatchlist("NFX", deps);
    expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
    expect(watchlist.rows()).toHaveLength(0);
  });

  it("7. a non-US listing gives 422 and nothing is inserted", async () => {
    const { watchlist, provider, deps } = setup();
    provider.enqueueSearch([usMatch("NUSA", { exchange: "LSE", micCode: "XLON", country: "United Kingdom" })]);
    const result = await addToWatchlist("NUSA", deps);
    expect(result).toMatchObject({ ok: false, status: 422, error: { code: "not_us" } });
    expect(watchlist.rows()).toHaveLength(0);
  });

  it("8. a full minute budget gives 429 with retryAfterSeconds 60 and nothing is inserted", async () => {
    const { watchlist, candles, provider, deps } = setup();
    candles.seedLog({ symbol: "OTHER", interval: "1day", status: "ok", createdAt: NOW, creditsUsed: 8 });
    const result = await addToWatchlist("BUDA", deps);
    expect(result).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" }, retryAfterSeconds: 60 });
    expect(provider.searchCalls).toHaveLength(0);
    expect(watchlist.rows()).toHaveLength(0);
  });

  it("9. an insert race (duplicate on insert) gives 409", async () => {
    const { watchlist, provider, deps } = setup();
    provider.enqueueSearch([usMatch("RACE")]);
    vi.spyOn(watchlist, "insert").mockResolvedValueOnce("duplicate");
    const result = await addToWatchlist("RACE", deps);
    expect(result).toMatchObject({ ok: false, status: 409, error: { code: "duplicate" } });
  });

  it("an insert failure gives 503 cache_unavailable", async () => {
    const { watchlist, provider, deps } = setup();
    provider.enqueueSearch([usMatch("INSF")]);
    watchlist.failNext("insert");
    const result = await addToWatchlist("INSF", deps);
    expect(result).toMatchObject({ ok: false, status: 503, error: { code: "cache_unavailable" } });
  });
});

describe("removeFromWatchlist", () => {
  it("10. removes a row, and a missing one gives 404 not_in_watchlist", async () => {
    const { watchlist, deps } = setup();
    await seedRows(watchlist, [
      ["REMA", 0],
      ["REMB", 1],
    ]);

    expect(await removeFromWatchlist("rema", deps)).toEqual({ ok: true });
    expect(watchlist.rows()).toEqual([{ symbol: "REMB", sortOrder: 1 }]);

    expect(await removeFromWatchlist("REMA", deps)).toEqual({
      ok: false,
      status: 404,
      error: { code: "not_in_watchlist", message: "REMA isn't in your watchlist." },
      retryAfterSeconds: null,
    });
  });

  it("10b. an invalid symbol gives 400", async () => {
    const { deps } = setup();
    expect(await removeFromWatchlist("a;b", deps)).toMatchObject({ ok: false, status: 400, error: { code: "invalid_symbol" } });
  });
});

describe("reorderWatchlist", () => {
  it("11. updates only rows whose sortOrder changed, and the list then reads in the new order", async () => {
    const { watchlist, deps } = setup();
    await seedRows(watchlist, [
      ["ORDA", 1],
      ["ORDB", 2],
      ["ORDC", 5],
    ]);
    const setSortOrders = vi.spyOn(watchlist, "setSortOrders");

    expect(await reorderWatchlist(["ORDC", "ORDA", "ORDB"], deps)).toEqual({ ok: true });

    expect(setSortOrders).toHaveBeenCalledTimes(1);
    expect(setSortOrders).toHaveBeenCalledWith([{ symbol: "ORDC", sortOrder: 0 }]);
    expect((await watchlist.list()).map((r) => r.symbol)).toEqual(["ORDC", "ORDA", "ORDB"]);
  });

  it("11b. [C,A,B] from [A,B,C] at 0,1,2 updates all three", async () => {
    const { watchlist, deps } = setup();
    await seedRows(watchlist, [
      ["ORDD", 0],
      ["ORDE", 1],
      ["ORDF", 2],
    ]);
    const setSortOrders = vi.spyOn(watchlist, "setSortOrders");
    expect(await reorderWatchlist(["ORDF", "ORDD", "ORDE"], deps)).toEqual({ ok: true });
    expect(setSortOrders).toHaveBeenCalledWith([
      { symbol: "ORDF", sortOrder: 0 },
      { symbol: "ORDD", sortOrder: 1 },
      { symbol: "ORDE", sortOrder: 2 },
    ]);
    expect(watchlist.rows().map((r) => r.symbol)).toEqual(["ORDF", "ORDD", "ORDE"]);
  });

  it("11c. an unchanged order makes no store update", async () => {
    const { watchlist, deps } = setup();
    await seedRows(watchlist, [
      ["ORDG", 0],
      ["ORDH", 1],
    ]);
    const setSortOrders = vi.spyOn(watchlist, "setSortOrders");
    expect(await reorderWatchlist(["ORDG", "ORDH"], deps)).toEqual({ ok: true });
    expect(setSortOrders).not.toHaveBeenCalled();
  });

  it.each([
    ["an extra symbol", ["MISA", "MISB", "MISX"]],
    ["a missing symbol", ["MISA"]],
    ["a different symbol", ["MISA", "MISX"]],
  ])("12. %s gives 409 order_mismatch", async (_label, order) => {
    const { watchlist, deps } = setup();
    await seedRows(watchlist, [
      ["MISA", 0],
      ["MISB", 1],
    ]);
    const setSortOrders = vi.spyOn(watchlist, "setSortOrders");
    expect(await reorderWatchlist(order, deps)).toEqual({
      ok: false,
      status: 409,
      error: { code: "order_mismatch", message: "Your watchlist changed somewhere else. Reload and try again." },
      retryAfterSeconds: null,
    });
    expect(setSortOrders).not.toHaveBeenCalled();
  });

  it.each([
    ["not an array", "BADA"],
    ["null", null],
    ["duplicates", ["BADA", "BADA"]],
    ["an invalid symbol", ["BADA", "a;b"]],
    ["a non-normalised symbol", ["bada"]],
    ["a non-string", ["BADA", 7]],
    ["too many symbols", Array.from({ length: MAX_WATCHLIST_ITEMS + 1 }, (_, i) => `BAD${i}`)],
  ])("13. %s gives 400 invalid_body", async (_label, body) => {
    const { watchlist, deps } = setup();
    const list = vi.spyOn(watchlist, "list");
    expect(await reorderWatchlist(body, deps)).toEqual({
      ok: false,
      status: 400,
      error: { code: "invalid_body", message: "Request body is not valid." },
      retryAfterSeconds: null,
    });
    expect(list).not.toHaveBeenCalled();
  });
});

describe("refreshWatchlistSymbol", () => {
  it("14a. a ticker not in the list gives 404 with no provider calls", async () => {
    const { provider, deps } = setup();
    const result = await refreshWatchlistSymbol("RFNO", deps);
    expect(result).toMatchObject({ ok: false, status: 404, error: { code: "not_in_watchlist" } });
    expect(provider.calls).toHaveLength(0);
  });

  it("14b. a cold ticker backfills once and returns the quote from the last 2 candles", async () => {
    const { watchlist, candles, provider, deps } = setup();
    await seedRows(watchlist, [["RFCO", 0]]);
    provider.enqueue([bar("2026-11-20", 20), bar("2026-11-23", 40), bar("2026-11-24", 50)]);

    const result = await refreshWatchlistSymbol("rfco", deps);

    expect(provider.calls).toEqual([{ symbol: "RFCO", interval: "1day", from: undefined }]);
    expect(result).toMatchObject({
      ok: true,
      source: "api",
      notice: null,
      item: { symbol: "RFCO", quote: { lastClose: 50, prevClose: 40, stale: false } },
    });
    expect(result.ok && "item" in result && result.item.quote?.changePct).toBeCloseTo(25, 10);
    expect(candles.logRows()).toMatchObject([{ symbol: "RFCO", interval: "1day", status: "ok" }]);
  });

  it("14c. a fresh cache makes no provider call and returns source cache", async () => {
    const { watchlist, candles, provider, deps } = setup();
    await seedRows(watchlist, [["RFFR", 0]]);
    candles.seedCandles("RFFR", "1day", [bar("2026-11-23", 8), bar("2026-11-24", 6)]);

    const result = await refreshWatchlistSymbol("RFFR", deps);

    expect(provider.calls).toHaveLength(0);
    expect(result).toMatchObject({
      ok: true,
      source: "cache",
      notice: null,
      item: { symbol: "RFFR", quote: { lastClose: 6, prevClose: 8, stale: false } },
    });
  });

  it("14d. a candle-service failure is returned as is", async () => {
    const { watchlist, candles, provider, deps } = setup();
    await seedRows(watchlist, [["RFRL", 0]]);
    candles.seedLog({ symbol: "OTHER", interval: "1day", status: "ok", createdAt: NOW, creditsUsed: 8 });
    const result = await refreshWatchlistSymbol("RFRL", deps);
    expect(result).toMatchObject({ ok: false, status: 429, error: { code: "rate_limited" }, retryAfterSeconds: 60 });
    expect(provider.calls).toHaveLength(0);
  });

  it("14e. an invalid symbol gives 400", async () => {
    const { deps } = setup();
    expect(await refreshWatchlistSymbol(["X"], deps)).toMatchObject({ ok: false, status: 400, error: { code: "invalid_symbol" } });
  });
});
