import type { Interval } from "@/lib/data-provider/types";

/** time = UTC seconds. */
export interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export type NoticeCode = "rate_limited" | "busy" | "provider_unavailable" | "provider_error";

export interface Notice {
  code: NoticeCode;
  message: string;
}

export type ErrorCode =
  | "invalid_symbol"
  | "invalid_interval"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "busy"
  | "provider_unavailable"
  | "provider_error"
  | "cache_unavailable"
  | "config"
  | "unauthorized"
  | "invalid_body"
  | "duplicate"
  | "watchlist_full"
  | "not_us"
  | "not_in_watchlist"
  | "order_mismatch";

export interface CandlesResponse {
  symbol: string;
  interval: Interval;
  candles: ApiCandle[];
  source: "cache" | "api";
  stale: boolean;
  notice: Notice | null;
}

export interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}
