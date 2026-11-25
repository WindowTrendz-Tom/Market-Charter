import "server-only";
import { StoreError, type CandleStore } from "@/lib/cache/candle-store";
import type { ErrorCode, Notice } from "@/lib/candles/api-types";
import { getChartCandles, type ChartCandlesFailure } from "@/lib/candles/get-chart-candles";
import { CACHE_UNAVAILABLE_MESSAGE } from "@/lib/candles/messages";
import type { DataProvider } from "@/lib/data-provider/types";
import { invalidSymbolMessage, normaliseSymbol } from "@/lib/symbol";
import { checkUsSymbol } from "@/lib/symbols/check-us-symbol";
import type { WatchlistItem, WatchlistQuote } from "./api-types";
import { MAX_WATCHLIST_ITEMS } from "./limits";
import { toQuote } from "./quote";
import type { WatchlistRow, WatchlistStore } from "./watchlist-store";

export interface WatchlistDeps {
  watchlist: WatchlistStore;
  candles: CandleStore;
  provider: DataProvider;
  now?: () => Date;
}

export type WatchlistFailure = {
  ok: false;
  status: 400 | 404 | 409 | 422 | 429 | 502 | 503;
  error: { code: ErrorCode; message: string };
  retryAfterSeconds: number | null;
};

export type ListWatchlistResult = { ok: true; items: WatchlistItem[] } | WatchlistFailure;
export type AddToWatchlistResult = { ok: true; item: WatchlistItem } | WatchlistFailure;
export type WatchlistChangeResult = { ok: true } | WatchlistFailure;
export type RefreshWatchlistResult =
  | { ok: true; item: WatchlistItem; source: "cache" | "api"; notice: Notice | null }
  | WatchlistFailure
  | ChartCandlesFailure;

const MAX_RAW_SYMBOL_LENGTH = 20;

const MESSAGES = {
  duplicate: (s: string) => `${s} is already in your watchlist.`,
  full: `Your watchlist is full (${MAX_WATCHLIST_ITEMS} tickers). Remove one first.`,
  notInWatchlist: (s: string) => `${s} isn't in your watchlist.`,
  invalidBody: "Request body is not valid.",
  orderMismatch: "Your watchlist changed somewhere else. Reload and try again.",
} as const;

function failure(status: WatchlistFailure["status"], code: ErrorCode, message: string): WatchlistFailure {
  return { ok: false, status, error: { code, message }, retryAfterSeconds: null };
}

/** Runs `fn`, turning a StoreError (watchlist or candle cache) into 503 cache_unavailable. */
async function guardStore<T>(operation: string, fn: () => Promise<T | WatchlistFailure>): Promise<T | WatchlistFailure> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StoreError) {
      console.error(`Watchlist store error (${operation}): ${err.message}`);
      return failure(503, "cache_unavailable", CACHE_UNAVAILABLE_MESSAGE);
    }
    throw err;
  }
}

/** A raw request symbol: a string of at most 20 chars that normalises. */
function parseSymbol(raw: unknown): { ok: true; symbol: string } | WatchlistFailure {
  const symbol = typeof raw === "string" && raw.length <= MAX_RAW_SYMBOL_LENGTH ? normaliseSymbol(raw) : null;
  if (symbol === null) return failure(400, "invalid_symbol", invalidSymbolMessage(String(raw ?? "")));
  return { ok: true, symbol };
}

function clockOf(deps: WatchlistDeps): () => Date {
  return deps.now ?? (() => new Date());
}

/** Quote from the cache only (0 credits): last 2 daily candles and the last ok fetch. */
async function readQuote(symbol: string, deps: WatchlistDeps, now: Date): Promise<WatchlistQuote | null> {
  const recent = await deps.candles.getRecentCandles(symbol, "1day", 2);
  const lastOkFetchAt = await deps.candles.getLastOkFetchAt(symbol, "1day");
  return toQuote(recent, lastOkFetchAt, now);
}

const hasSymbol = (rows: WatchlistRow[], symbol: string) => rows.some((r) => r.symbol === symbol);

/** The watchlist with cached quotes. Never calls the provider. */
export function listWatchlist(deps: WatchlistDeps): Promise<ListWatchlistResult> {
  return guardStore("list", async () => {
    const now = clockOf(deps)();
    const rows = await deps.watchlist.list();
    const items = await Promise.all(
      rows.map(async (r): Promise<WatchlistItem> => ({ symbol: r.symbol, quote: await readQuote(r.symbol, deps, now) })),
    );
    return { ok: true as const, items };
  });
}

/** Adds a ticker after the 0-credit checks (format, duplicate, full) and the 1-credit US symbol check. */
export function addToWatchlist(raw: unknown, deps: WatchlistDeps): Promise<AddToWatchlistResult> {
  return guardStore("add", async () => {
    const parsed = parseSymbol(raw);
    if (!parsed.ok) return parsed;
    const { symbol } = parsed;

    const rows = await deps.watchlist.list();
    if (hasSymbol(rows, symbol)) return failure(409, "duplicate", MESSAGES.duplicate(symbol));
    if (rows.length >= MAX_WATCHLIST_ITEMS) return failure(409, "watchlist_full", MESSAGES.full);

    const check = await checkUsSymbol(symbol, { store: deps.candles, provider: deps.provider, now: deps.now });
    if (!check.ok) return check;

    const sortOrder = rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0;
    if ((await deps.watchlist.insert(symbol, sortOrder)) === "duplicate") {
      return failure(409, "duplicate", MESSAGES.duplicate(symbol));
    }
    const quote = await readQuote(symbol, deps, clockOf(deps)());
    return { ok: true as const, item: { symbol, quote } };
  });
}

export function removeFromWatchlist(raw: unknown, deps: WatchlistDeps): Promise<WatchlistChangeResult> {
  return guardStore("remove", async () => {
    const parsed = parseSymbol(raw);
    if (!parsed.ok) return parsed;
    if (!(await deps.watchlist.remove(parsed.symbol))) {
      return failure(404, "not_in_watchlist", MESSAGES.notInWatchlist(parsed.symbol));
    }
    return { ok: true as const };
  });
}

/** `symbols` = the full new order. Only rows whose sort_order changes are updated. */
export function reorderWatchlist(symbols: unknown, deps: WatchlistDeps): Promise<WatchlistChangeResult> {
  return guardStore("reorder", async () => {
    const valid =
      Array.isArray(symbols) &&
      symbols.length <= MAX_WATCHLIST_ITEMS &&
      symbols.every((s) => typeof s === "string" && normaliseSymbol(s) === s) &&
      new Set(symbols).size === symbols.length;
    if (!valid) return failure(400, "invalid_body", MESSAGES.invalidBody);
    const order = symbols as string[];

    const rows = await deps.watchlist.list();
    const current = new Map(rows.map((r) => [r.symbol, r.sortOrder]));
    if (rows.length !== order.length || order.some((s) => !current.has(s))) {
      return failure(409, "order_mismatch", MESSAGES.orderMismatch);
    }

    const updates = order
      .map((symbol, index): WatchlistRow => ({ symbol, sortOrder: index }))
      .filter((u) => current.get(u.symbol) !== u.sortOrder);
    if (updates.length > 0) await deps.watchlist.setSortOrders(updates);
    return { ok: true as const };
  });
}

/** Refreshes one watchlist ticker through the cache-first candle service and returns only its new quote. */
export function refreshWatchlistSymbol(raw: unknown, deps: WatchlistDeps): Promise<RefreshWatchlistResult> {
  return guardStore<RefreshWatchlistResult>("refresh", async () => {
    const parsed = parseSymbol(raw);
    if (!parsed.ok) return parsed;
    const { symbol } = parsed;

    if (!hasSymbol(await deps.watchlist.list(), symbol)) {
      return failure(404, "not_in_watchlist", MESSAGES.notInWatchlist(symbol));
    }

    const r = await getChartCandles(symbol, "1day", { store: deps.candles, provider: deps.provider, now: deps.now });
    if (!r.ok) return r;

    const now = clockOf(deps)();
    const quote = toQuote(r.candles.slice(-2), await deps.candles.getLastOkFetchAt(symbol, "1day"), now);
    return { ok: true, item: { symbol, quote }, source: r.source, notice: r.notice };
  });
}
