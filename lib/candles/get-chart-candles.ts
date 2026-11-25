import "server-only";
import { StoreError, type CandleStore, type FetchCompletion, type FetchFinalStatus } from "@/lib/cache/candle-store";
import {
  ProviderError,
  type Candle,
  type DataProvider,
  type Interval,
  type ProviderErrorKind,
} from "@/lib/data-provider/types";
import { dailyTsToDate, expectedLatestDailyCandleDate, isDailyCacheFresh } from "@/lib/time/market-calendar";
import type { ErrorCode, Notice, NoticeCode } from "./api-types";
import { BUSY_RETRY_SECONDS, CREDITS_PER_CALL, CREDITS_PER_DAY, CREDITS_PER_MINUTE } from "./limits";

export interface ChartCandlesDeps {
  store: CandleStore;
  provider: DataProvider;
  now?: () => Date;
}

export type ChartCandlesFailure = {
  ok: false;
  status: 403 | 404 | 429 | 502 | 503;
  error: { code: ErrorCode; message: string };
  retryAfterSeconds: number | null;
};

export type ChartCandlesResult =
  | { ok: true; candles: Candle[]; source: "cache" | "api"; stale: boolean; notice: Notice | null }
  | ChartCandlesFailure;

const MINUTE_MS = 60_000;
const RATE_LIMIT_RETRY_SECONDS = 60;
const MAX_LOG_MESSAGE_LENGTH = 500;
const CACHED_PREFIX = "Showing cached data. ";

const MESSAGES = {
  minuteLimit: "Twelve Data's free-plan limit (8 calls a minute) has been reached. Try again in about a minute.",
  dayLimit: "Twelve Data's daily limit (800 calls) has been reached. It resets at midnight UTC (1 pm NZDT / 12 pm NZST).",
  providerLimit: "Twelve Data says the free-plan limit has been reached. Try again in about a minute.",
  busy: (s: string) => `${s} is being loaded by another request. Retrying shortly…`,
  notFound: (s: string) => `No US ticker "${s}" was found at Twelve Data.`,
  forbidden: (s: string) => `${s} isn't available on the Twelve Data free plan.`,
  providerUnavailable: "Couldn't reach Twelve Data. Try again shortly.",
  providerError: "Twelve Data returned an unexpected error. Check the server logs.",
  cacheUnavailable: "The price cache (Supabase) isn't reachable right now. Try again shortly.",
} as const;

interface ProviderFailureRule {
  logStatus: FetchFinalStatus;
  status: 403 | 404 | 502;
  code: ErrorCode;
  noticeCode: NoticeCode;
  message: (symbol: string) => string;
}

/** How each provider error (other than rate limiting) is logged and reported. */
const PROVIDER_FAILURES: Record<Exclude<ProviderErrorKind, "rate_limited">, ProviderFailureRule> = {
  not_found: { logStatus: "not_found", status: 404, code: "not_found", noticeCode: "provider_error", message: MESSAGES.notFound },
  forbidden: { logStatus: "error", status: 403, code: "forbidden", noticeCode: "provider_error", message: MESSAGES.forbidden },
  unavailable: {
    logStatus: "error",
    status: 502,
    code: "provider_unavailable",
    noticeCode: "provider_unavailable",
    message: () => MESSAGES.providerUnavailable,
  },
  auth: { logStatus: "error", status: 502, code: "provider_error", noticeCode: "provider_error", message: () => MESSAGES.providerError },
  bad_response: {
    logStatus: "error",
    status: 502,
    code: "provider_error",
    noticeCode: "provider_error",
    message: () => MESSAGES.providerError,
  },
};

/** One in-flight load per series on this server instance. */
const inFlight = new Map<string, Promise<ChartCandlesResult>>();

/**
 * Cache-first daily candles. `symbol` must already be normalised.
 * Concurrent calls for the same series on this instance share one load (checked before any await).
 */
export function getChartCandles(symbol: string, interval: Interval, deps: ChartCandlesDeps): Promise<ChartCandlesResult> {
  const key = `${symbol}:${interval}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const p = load(symbol, interval, deps).finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

function failure(
  status: ChartCandlesFailure["status"],
  code: ErrorCode,
  message: string,
  retryAfterSeconds: number | null = null,
): ChartCandlesFailure {
  return { ok: false, status, error: { code, message }, retryAfterSeconds };
}

function secondsUntilNextUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function load(symbol: string, interval: Interval, deps: ChartCandlesDeps): Promise<ChartCandlesResult> {
  try {
    return await loadOrThrow(symbol, interval, deps);
  } catch (err) {
    if (err instanceof StoreError) {
      console.error(`Candle cache error (${symbol} ${interval}): ${err.message}`);
      return failure(503, "cache_unavailable", MESSAGES.cacheUnavailable);
    }
    throw err;
  }
}

async function loadOrThrow(symbol: string, interval: Interval, deps: ChartCandlesDeps): Promise<ChartCandlesResult> {
  const { store, provider } = deps;
  const clock = deps.now ?? (() => new Date());
  const now = clock();

  // 1. Freshness (0 credits).
  const latestTs = await store.getLatestCandleTs(symbol, interval);
  const lastOkFetchAt = await store.getLastOkFetchAt(symbol, interval);
  if (isDailyCacheFresh({ latestCachedTs: latestTs, lastOkFetchAt, now })) {
    return { ok: true, candles: await store.getCandles(symbol, interval), source: "cache", stale: false, notice: null };
  }

  const hasCache = latestTs !== null;
  const serveCacheOr = async (notice: Notice, fallback: ChartCandlesFailure): Promise<ChartCandlesResult> => {
    if (!hasCache) return fallback;
    return {
      ok: true,
      candles: await store.getCandles(symbol, interval),
      source: "cache",
      stale: true,
      notice: { code: notice.code, message: CACHED_PREFIX + notice.message },
    };
  };
  const limited = (message: string, retryAfterSeconds: number) =>
    serveCacheOr({ code: "rate_limited", message }, failure(429, "rate_limited", message, retryAfterSeconds));

  // 2. Local budget guard (no fetch_log row when refused).
  const minuteCredits = await store.sumCreditsSince(new Date(now.getTime() - MINUTE_MS));
  if (minuteCredits >= CREDITS_PER_MINUTE) return limited(MESSAGES.minuteLimit, RATE_LIMIT_RETRY_SECONDS);
  const dayCredits = await store.sumCreditsSince(startOfUtcDay(now));
  if (dayCredits >= CREDITS_PER_DAY) return limited(MESSAGES.dayLimit, secondsUntilNextUtcMidnight(now));

  // 3. DB lease: one Twelve Data call per series at a time, across instances.
  const leaseId = await store.acquireFetchLease(symbol, interval, now);
  if (leaseId === null) {
    const message = MESSAGES.busy(symbol);
    return serveCacheOr({ code: "busy", message }, failure(503, "busy", message, BUSY_RETRY_SECONDS));
  }
  const closeLease = (completion: Omit<FetchCompletion, "creditsUsed">) =>
    completeLeaseBestEffort(store, leaseId, { ...completion, creditsUsed: CREDITS_PER_CALL }, clock());

  // 4. Provider call (1 credit). `from` is inclusive, so the last cached bar is re-fetched and corrected.
  const from = latestTs ? dailyTsToDate(latestTs) : undefined;
  let received: Candle[];
  try {
    received = await provider.getCandles(symbol, interval, from);
  } catch (err) {
    if (!(err instanceof ProviderError)) {
      await closeLease({ status: "error", candlesReceived: null, message: "Unexpected data provider failure" });
      throw err;
    }
    const logMessage = err.message.slice(0, MAX_LOG_MESSAGE_LENGTH);
    if (err.kind === "rate_limited") {
      await closeLease({ status: "rate_limited", candlesReceived: null, message: logMessage });
      return limited(MESSAGES.providerLimit, RATE_LIMIT_RETRY_SECONDS);
    }
    const rule = PROVIDER_FAILURES[err.kind];
    await closeLease({ status: rule.logStatus, candlesReceived: null, message: logMessage });
    if (err.kind === "auth" || err.kind === "bad_response") {
      console.error(`Data provider ${provider.name} ${err.kind} error (${symbol} ${interval}): ${logMessage}`);
    }
    const message = rule.message(symbol);
    return serveCacheOr({ code: rule.noticeCode, message }, failure(rule.status, rule.code, message));
  }

  // 5. Store completed bars only (drop the in-progress session bar).
  const expected = expectedLatestDailyCandleDate(now);
  const completed = received.filter((c) => dailyTsToDate(c.ts) <= expected);
  try {
    await store.upsertCandles(symbol, interval, completed);
  } catch (err) {
    // Don't mark the call 'ok': that would make the cache look fresh without the new bars.
    await closeLease({ status: "error", candlesReceived: received.length, message: "Saving candles failed" });
    throw err;
  }
  await closeLease({ status: "ok", candlesReceived: received.length, message: null });

  const all = await store.getCandles(symbol, interval);
  if (all.length === 0) return failure(404, "not_found", MESSAGES.notFound(symbol));
  return { ok: true, candles: all, source: "api", stale: false, notice: null };
}

/** A lease row left 'pending' expires after LEASE_TTL_MS, so a failed completion must not hide the provider result. */
async function completeLeaseBestEffort(store: CandleStore, id: number, completion: FetchCompletion, now: Date) {
  try {
    await store.completeFetchLease(id, completion, now);
  } catch (err) {
    console.error(`Could not complete fetch_log lease ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
