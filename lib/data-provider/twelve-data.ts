import "server-only";
import { dateToDailyTs } from "@/lib/time/market-calendar";
import { ProviderError, type Candle, type DataProvider, type Interval, type SymbolMatch } from "./types";

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
  data?: unknown;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return NaN;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function mapMatch(raw: unknown): SymbolMatch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.symbol !== "string" || m.symbol === "") return null;
  return {
    symbol: m.symbol,
    name: toStringOrNull(m.instrument_name),
    exchange: toStringOrNull(m.exchange),
    micCode: toStringOrNull(m.mic_code),
    country: toStringOrNull(m.country),
    instrumentType: toStringOrNull(m.instrument_type),
    currency: toStringOrNull(m.currency),
  };
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

  /** Fetches and parses one endpoint, mapping every error. Returns null for "no data is available". */
  private async requestJson(path: string, params: URLSearchParams): Promise<RawResponse | null> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}?${params.toString()}`, {
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
        if (/no data is available/i.test(message)) return null;
        if (/symbol/i.test(message)) throw new ProviderError("not_found", message, res.status);
        throw new ProviderError("bad_response", message, res.status);
      }
      if (code >= 500) throw new ProviderError("unavailable", message, res.status);
      throw new ProviderError("bad_response", message, res.status);
    }
    return json;
  }

  async searchSymbols(query: string): Promise<SymbolMatch[]> {
    const json = await this.requestJson("/symbol_search", new URLSearchParams({ symbol: query, outputsize: "30" }));
    if (json === null) return [];
    if (!Array.isArray(json.data)) throw new ProviderError("bad_response", "Data provider returned an unexpected response");
    return json.data.map(mapMatch).filter((m): m is SymbolMatch => m !== null);
  }

  async getCandles(symbol: string, interval: Interval, from?: string): Promise<Candle[]> {
    // Never send `order`: the default (newest first) makes the backfill return the latest bars. We sort locally.
    const params = new URLSearchParams({ symbol, interval });
    if (from) params.set("start_date", from);
    else params.set("outputsize", String(INITIAL_OUTPUTSIZE));

    const json = await this.requestJson("/time_series", params);
    if (json === null) return [];
    if (json.status !== "ok" || !Array.isArray(json.values)) {
      throw new ProviderError("bad_response", "Data provider returned an unexpected response");
    }
    const byTs = new Map<string, Candle>();
    for (const raw of json.values) {
      const candle = mapValue(raw);
      byTs.set(candle.ts, candle);
    }
    return [...byTs.values()].sort((a, b) => a.ts.localeCompare(b.ts));
  }
}
