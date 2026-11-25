export type Interval = "1day";
export const SUPPORTED_INTERVALS: readonly Interval[] = ["1day"];

/** ts = ISO UTC timestamp. */
export interface Candle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

export interface DataProvider {
  readonly name: string;
  /** Candles ascending by ts. `from` = 'YYYY-MM-DD', inclusive, exchange-local date. Omitted = full history backfill. */
  getCandles(symbol: string, interval: Interval, from?: string): Promise<Candle[]>;
}

export type ProviderErrorKind =
  | "rate_limited"
  | "not_found"
  | "forbidden"
  | "auth"
  | "unavailable"
  | "bad_response";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
