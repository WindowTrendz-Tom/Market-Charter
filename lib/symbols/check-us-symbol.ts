import "server-only";
import { StoreError, type CandleStore, type FetchCompletion } from "@/lib/cache/candle-store";
import { completeLeaseBestEffort } from "@/lib/cache/complete-lease";
import type { ErrorCode } from "@/lib/candles/api-types";
import { checkCreditBudget } from "@/lib/candles/credit-budget";
import { BUSY_RETRY_SECONDS, CREDITS_PER_CALL, MAX_LOG_MESSAGE_LENGTH } from "@/lib/candles/limits";
import { CACHE_UNAVAILABLE_MESSAGE, LIMIT_MESSAGES } from "@/lib/candles/messages";
import { ProviderError, type DataProvider, type SymbolMatch } from "@/lib/data-provider/types";
import { pickUsListing, summariseMatches } from "./us-listing";

export type SymbolCheckFailure = {
  ok: false;
  status: 404 | 422 | 429 | 502 | 503;
  error: { code: ErrorCode; message: string };
  retryAfterSeconds: number | null;
};

export type SymbolCheckResult = { ok: true; match: SymbolMatch } | SymbolCheckFailure;

export interface SymbolCheckDeps {
  store: CandleStore;
  provider: DataProvider;
  now?: () => Date;
}

const SEARCH_LOG_INTERVAL = "symbol_search";
const RATE_LIMIT_RETRY_SECONDS = 60;

const MESSAGES = {
  busy: (s: string) => `${s} is already being checked. Try again in a moment.`,
  notUs: (s: string, exchanges: string[]) =>
    `${s} isn't listed on a US exchange (found on ${exchanges.join(", ")}). Only US tickers are supported.`,
  notFound: (s: string) => `No US-listed ticker "${s}" was found at Twelve Data.`,
  providerUnavailable: "Couldn't reach Twelve Data to check the ticker. Try again shortly.",
  providerError: "Twelve Data returned an unexpected error while checking the ticker. Check the server logs.",
} as const;

function failure(
  status: SymbolCheckFailure["status"],
  code: ErrorCode,
  message: string,
  retryAfterSeconds: number | null = null,
): SymbolCheckFailure {
  return { ok: false, status, error: { code, message }, retryAfterSeconds };
}

/**
 * Checks that `symbol` (already normalised) is a US-listed ticker, via the provider's symbol search (1 credit).
 * Goes through the shared credit budget and a fetch_log lease on (symbol, 'symbol_search').
 */
export async function checkUsSymbol(symbol: string, deps: SymbolCheckDeps): Promise<SymbolCheckResult> {
  try {
    return await checkOrThrow(symbol, deps);
  } catch (err) {
    if (err instanceof StoreError) {
      console.error(`Candle cache error (${symbol} ${SEARCH_LOG_INTERVAL}): ${err.message}`);
      return failure(503, "cache_unavailable", CACHE_UNAVAILABLE_MESSAGE);
    }
    throw err;
  }
}

async function checkOrThrow(symbol: string, deps: SymbolCheckDeps): Promise<SymbolCheckResult> {
  const { store, provider } = deps;
  const clock = deps.now ?? (() => new Date());
  const now = clock();

  // 1. Local budget guard (no fetch_log row when refused).
  const refusal = await checkCreditBudget(store, now);
  if (refusal) return failure(429, "rate_limited", refusal.message, refusal.retryAfterSeconds);

  // 2. DB lease: one search per symbol at a time (de-dupes double-clicks).
  const leaseId = await store.acquireFetchLease(symbol, SEARCH_LOG_INTERVAL, now);
  if (leaseId === null) return failure(503, "busy", MESSAGES.busy(symbol), BUSY_RETRY_SECONDS);
  const closeLease = (completion: Omit<FetchCompletion, "creditsUsed" | "candlesReceived">) =>
    completeLeaseBestEffort(
      store,
      leaseId,
      { ...completion, creditsUsed: CREDITS_PER_CALL, candlesReceived: null },
      clock(),
    );

  // 3. Provider call (1 credit).
  let matches: SymbolMatch[];
  try {
    matches = await provider.searchSymbols(symbol);
  } catch (err) {
    if (!(err instanceof ProviderError)) {
      await closeLease({ status: "error", message: "Unexpected data provider failure" });
      throw err;
    }
    const logMessage = err.message.slice(0, MAX_LOG_MESSAGE_LENGTH);
    switch (err.kind) {
      case "not_found":
        matches = [];
        break;
      case "rate_limited":
        await closeLease({ status: "rate_limited", message: logMessage });
        return failure(429, "rate_limited", LIMIT_MESSAGES.provider, RATE_LIMIT_RETRY_SECONDS);
      case "unavailable":
        await closeLease({ status: "error", message: logMessage });
        return failure(502, "provider_unavailable", MESSAGES.providerUnavailable);
      case "forbidden":
      case "auth":
      case "bad_response":
        await closeLease({ status: "error", message: logMessage });
        console.error(`Data provider ${provider.name} ${err.kind} error (${symbol} ${SEARCH_LOG_INTERVAL}): ${logMessage}`);
        return failure(502, "provider_error", MESSAGES.providerError);
    }
  }

  // 4. US listing rule.
  const pick = pickUsListing(symbol, matches);
  switch (pick.kind) {
    case "us":
      await closeLease({ status: "ok", message: null });
      return { ok: true, match: pick.match };
    case "non_us":
      await closeLease({
        status: "not_found",
        message: `non-US only: ${summariseMatches(matches)}`.slice(0, MAX_LOG_MESSAGE_LENGTH),
      });
      return failure(422, "not_us", MESSAGES.notUs(symbol, pick.exchanges));
    case "none":
      await closeLease({ status: "not_found", message: summariseMatches(matches).slice(0, MAX_LOG_MESSAGE_LENGTH) });
      return failure(404, "not_found", MESSAGES.notFound(symbol));
  }
}
