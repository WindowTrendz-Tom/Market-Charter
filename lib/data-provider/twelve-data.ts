import "server-only";
import { dateToDailyTs } from "@/lib/time/market-calendar";
import { ProviderError, type Candle, type DataProvider, type Interval } from "./types";

export const INITIAL_OUTPUTSIZE = 5000;

const DEFAULT_BASE_URL = "https://api.twelvedata.com";
const DEFAULT_TIMEOUT_MS = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TwelveDataProviderOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

interface RawValue {
  datetime?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
}

interface RawResponse {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  values?: unknown;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

function mapValue(raw: unknown): Candle {
  if (typeof raw !== "object" || raw === null) throw new ProviderError("bad_response", "Unexpected candle format from data provider");
  const v = raw as RawValue;
  const date = typeof v.datetime === "string" ? v.datetime.slice(0, 10) : "";
  if (!DATE_RE.test(date)) throw new ProviderError("bad_response", "Invalid candle date from data provider");
  const open = toNumber(v.open);
  const high = toNumber(v.high);
  const low = toNumber(v.low);
  const close = toNumber(v.close);
  const volume = v.volume === undefined ? null : toNumber(v.volume);
  if (![open, high, low, close].every(Number.isFinite) || (volume !== null && !Number.isFinite(volume))) {
    throw new ProviderError("bad_response", "Invalid candle value from data provider");
  }
  return { ts: dateToDailyTs(date), open, high, low, close, volume };
}

export class TwelveDataProvider implements DataProvider {
  readonly name = "twelve-data";
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: TwelveDataProviderOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getCandles(symbol: string, interval: Interval, from?: string): Promise<Candle[]> {
    // Never send `order`: the default (newest first) makes the backfill return the latest bars. We sort locally.
    const params = new URLSearchParams({ symbol, interval });
    if (from) params.set("start_date", from);
    else params.set("outputsize", String(INITIAL_OUTPUTSIZE));

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/time_series?${params.toString()}`, {
        headers: { Authorization: `apikey ${this.apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ProviderError("unavailable", "Could not reach the data provider");
    }

    let json: RawResponse;
    try {
      json = (await res.json()) as RawResponse;
    } catch {
      throw new ProviderError(res.status >= 500 ? "unavailable" : "bad_response", "Data provider returned an unreadable response", res.status);
    }
    if (typeof json !== "object" || json === null) {
      throw new ProviderError("bad_response", "Data provider returned an unexpected response", res.status);
    }

    const message = typeof json.message === "string" ? json.message : "Data provider error";
    const code = json.status === "error" ? Number(json.code) : res.ok ? null : res.status;
    if (code !== null) {
      if (code === 429) throw new ProviderError("rate_limited", message, res.status);
      if (code === 401) throw new ProviderError("auth", message, res.status);
      if (code === 403) throw new ProviderError("forbidden", message, res.status);
      if (code === 404) throw new ProviderError("not_found", message, res.status);
      if (code === 400) {
        if (/no data is available/i.test(message)) return [];
        if (/symbol/i.test(message)) throw new ProviderError("not_found", message, res.status);
        throw new ProviderError("bad_response", message, res.status);
      }
      if (code >= 500) throw new ProviderError("unavailable", message, res.status);
      throw new ProviderError("bad_response", message, res.status);
    }

    if (json.status !== "ok" || !Array.isArray(json.values)) {
      throw new ProviderError("bad_response", "Data provider returned an unexpected response", res.status);
    }
    const byTs = new Map<string, Candle>();
    for (const raw of json.values) {
      const candle = mapValue(raw);
      byTs.set(candle.ts, candle);
    }
    return [...byTs.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  }
}
