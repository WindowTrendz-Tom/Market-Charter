import type { Candle, Interval } from "@/lib/data-provider/types";

export type FetchFinalStatus = "ok" | "rate_limited" | "not_found" | "error";

export interface FetchCompletion {
  status: FetchFinalStatus;
  creditsUsed: number;
  candlesReceived: number | null;
  message: string | null;
}

export interface CandleStore {
  /** Ascending by ts, all rows. */
  getCandles(symbol: string, interval: Interval): Promise<Candle[]>;
  /** ISO UTC, or null when the series is empty. */
  getLatestCandleTs(symbol: string, interval: Interval): Promise<string | null>;
  upsertCandles(symbol: string, interval: Interval, candles: Candle[]): Promise<void>;
  /** created_at of the latest fetch_log row with status 'ok'. */
  getLastOkFetchAt(symbol: string, interval: Interval): Promise<Date | null>;
  /** Credits logged since `since`, across all symbols. */
  sumCreditsSince(since: Date): Promise<number>;
  /** Returns the fetch_log id, or null if another pending lease exists for the series. */
  acquireFetchLease(symbol: string, interval: Interval, now: Date): Promise<number | null>;
  completeFetchLease(id: number, completion: FetchCompletion, now: Date): Promise<void>;
}

export class StoreError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export const LEASE_TTL_MS = 60_000;
