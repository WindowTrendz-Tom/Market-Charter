import type { Candle } from "@/lib/data-provider/types";
import { isDailyCacheFresh } from "@/lib/time/market-calendar";
import type { WatchlistQuote } from "./api-types";

/** `recent` is ascending by ts (as returned by CandleStore.getRecentCandles). */
export function toQuote(recent: Candle[], lastOkFetchAt: Date | null, now: Date): WatchlistQuote | null {
  const last = recent.at(-1);
  if (!last) return null;
  const prev = recent.length > 1 ? (recent.at(-2) ?? null) : null;
  return {
    lastClose: last.close,
    prevClose: prev ? prev.close : null,
    changePct: prev && prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : null,
    asOf: Date.parse(last.ts) / 1000,
    stale: !isDailyCacheFresh({ latestCachedTs: last.ts, lastOkFetchAt, now }),
  };
}
