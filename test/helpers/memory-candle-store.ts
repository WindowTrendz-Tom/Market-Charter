import {
  LEASE_TTL_MS,
  StoreError,
  type CandleStore,
  type FetchCompletion,
} from "@/lib/cache/candle-store";
import type { Candle, Interval } from "@/lib/data-provider/types";

export interface MemoryLogRow {
  id: number;
  symbol: string;
  interval: Interval;
  creditsUsed: number;
  status: "pending" | "ok" | "rate_limited" | "not_found" | "error" | "expired";
  candlesReceived: number | null;
  message: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

type StoreMethod = keyof CandleStore;

/** In-memory CandleStore with the same semantics as the Supabase one. Test-only. */
export class MemoryCandleStore implements CandleStore {
  private candles = new Map<string, Map<string, Candle>>();
  private log: MemoryLogRow[] = [];
  private nextId = 1;
  private failing = new Set<StoreMethod>();

  private key(symbol: string, interval: Interval) {
    return `${symbol}|${interval}`;
  }

  private enter(method: StoreMethod) {
    if (this.failing.delete(method)) throw new StoreError(`Memory ${method} failed (injected)`);
  }

  // test-only helpers
  logRows(): MemoryLogRow[] {
    return this.log.map((r) => ({ ...r }));
  }

  seedCandles(symbol: string, interval: Interval, candles: Candle[]) {
    this.put(symbol, interval, candles);
  }

  seedLog(row: Partial<MemoryLogRow> & Pick<MemoryLogRow, "symbol" | "interval" | "status" | "createdAt">) {
    this.log.push({
      id: this.nextId++,
      creditsUsed: 0,
      candlesReceived: null,
      message: null,
      completedAt: null,
      ...row,
    });
  }

  failNext(method: StoreMethod) {
    this.failing.add(method);
  }

  private put(symbol: string, interval: Interval, candles: Candle[]) {
    const k = this.key(symbol, interval);
    const series = this.candles.get(k) ?? new Map<string, Candle>();
    for (const c of candles) series.set(new Date(c.ts).toISOString(), { ...c, ts: new Date(c.ts).toISOString() });
    this.candles.set(k, series);
  }

  async getCandles(symbol: string, interval: Interval) {
    this.enter("getCandles");
    const series = this.candles.get(this.key(symbol, interval));
    return [...(series?.values() ?? [])].sort((a, b) => a.ts.localeCompare(b.ts)).map((c) => ({ ...c }));
  }

  async getLatestCandleTs(symbol: string, interval: Interval) {
    this.enter("getLatestCandleTs");
    const series = this.candles.get(this.key(symbol, interval));
    if (!series || series.size === 0) return null;
    return [...series.keys()].sort().at(-1) ?? null;
  }

  async upsertCandles(symbol: string, interval: Interval, candles: Candle[]) {
    this.enter("upsertCandles");
    this.put(symbol, interval, candles);
  }

  async getLastOkFetchAt(symbol: string, interval: Interval) {
    this.enter("getLastOkFetchAt");
    const times = this.log
      .filter((r) => r.symbol === symbol && r.interval === interval && r.status === "ok")
      .map((r) => r.createdAt.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }

  async sumCreditsSince(since: Date) {
    this.enter("sumCreditsSince");
    return this.log.filter((r) => r.createdAt >= since).reduce((sum, r) => sum + r.creditsUsed, 0);
  }

  async acquireFetchLease(symbol: string, interval: Interval, now: Date) {
    this.enter("acquireFetchLease");
    const cutoff = now.getTime() - LEASE_TTL_MS;
    for (const r of this.log) {
      if (r.symbol === symbol && r.interval === interval && r.status === "pending" && r.createdAt.getTime() < cutoff) {
        r.status = "expired";
        r.completedAt = now;
        r.message = "lease expired";
      }
    }
    if (this.log.some((r) => r.symbol === symbol && r.interval === interval && r.status === "pending")) return null;
    const id = this.nextId++;
    this.log.push({
      id,
      symbol,
      interval,
      creditsUsed: 1,
      status: "pending",
      candlesReceived: null,
      message: null,
      createdAt: now,
      completedAt: null,
    });
    return id;
  }

  async completeFetchLease(id: number, completion: FetchCompletion, now: Date) {
    this.enter("completeFetchLease");
    const row = this.log.find((r) => r.id === id);
    if (!row) return;
    row.status = completion.status;
    row.creditsUsed = completion.creditsUsed;
    row.candlesReceived = completion.candlesReceived;
    row.message = completion.message;
    row.completedAt = now;
  }
}
