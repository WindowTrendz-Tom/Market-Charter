import type { Notice } from "@/lib/candles/api-types";

/** asOf = UTC seconds of the last cached daily bar. changePct in percent (1.5 = +1.5%). */
export interface WatchlistQuote {
  lastClose: number;
  prevClose: number | null;
  changePct: number | null;
  asOf: number;
  stale: boolean;
}

export interface WatchlistItem {
  symbol: string;
  quote: WatchlistQuote | null;
}

export interface WatchlistResponse {
  items: WatchlistItem[];
}

export interface WatchlistItemResponse {
  item: WatchlistItem;
}

export interface WatchlistRefreshResponse {
  item: WatchlistItem;
  source: "cache" | "api";
  notice: Notice | null;
}
