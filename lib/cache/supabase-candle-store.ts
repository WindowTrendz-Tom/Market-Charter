import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Candle } from "@/lib/data-provider/types";
import { LEASE_TTL_MS, StoreError, type CandleStore, type FetchCompletion } from "./candle-store";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const UNIQUE_VIOLATION = "23505";

function fail(operation: string, error: { message: string }): never {
  throw new StoreError(`Supabase ${operation} failed: ${error.message}`, error);
}

export function createSupabaseCandleStore(client: SupabaseClient<Database>): CandleStore {
  /** Reads every page of a query; `fetchPage` must apply a stable order. */
  async function readAll<T>(
    operation: string,
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await fetchPage(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) fail(operation, error);
      const batch = data ?? [];
      rows.push(...batch);
      if (batch.length < PAGE_SIZE) return rows;
    }
    throw new StoreError(`Supabase ${operation} failed: more than ${MAX_PAGES * PAGE_SIZE} rows`);
  }

  return {
    async getCandles(symbol, interval) {
      const rows = await readAll("getCandles", (from, to) =>
        client
          .from("candles")
          .select("ts,open,high,low,close,volume")
          .eq("symbol", symbol)
          .eq("interval", interval)
          .order("ts", { ascending: true })
          .range(from, to),
      );
      return rows.map(
        (r): Candle => ({
          ts: new Date(r.ts).toISOString(),
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          volume: r.volume === null ? null : Number(r.volume),
        }),
      );
    },

    async getLatestCandleTs(symbol, interval) {
      const { data, error } = await client
        .from("candles")
        .select("ts")
        .eq("symbol", symbol)
        .eq("interval", interval)
        .order("ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("getLatestCandleTs", error);
      return data ? new Date(data.ts).toISOString() : null;
    },

    async upsertCandles(symbol, interval, candles) {
      for (let i = 0; i < candles.length; i += PAGE_SIZE) {
        const chunk = candles.slice(i, i + PAGE_SIZE).map((c) => ({ symbol, interval, ...c }));
        const { error } = await client.from("candles").upsert(chunk, { onConflict: "symbol,interval,ts" });
        if (error) fail("upsertCandles", error);
      }
    },

    async getLastOkFetchAt(symbol, interval) {
      const { data, error } = await client
        .from("fetch_log")
        .select("created_at")
        .eq("symbol", symbol)
        .eq("interval", interval)
        .eq("status", "ok")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("getLastOkFetchAt", error);
      return data ? new Date(data.created_at) : null;
    },

    async sumCreditsSince(since) {
      const rows = await readAll("sumCreditsSince", (from, to) =>
        client
          .from("fetch_log")
          .select("credits_used")
          .gte("created_at", since.toISOString())
          .gt("credits_used", 0)
          .order("id", { ascending: true })
          .range(from, to),
      );
      return rows.reduce((sum, r) => sum + r.credits_used, 0);
    },

    async acquireFetchLease(symbol, interval, now) {
      const expiry = await client
        .from("fetch_log")
        .update({ status: "expired", completed_at: now.toISOString(), message: "lease expired" })
        .eq("symbol", symbol)
        .eq("interval", interval)
        .eq("status", "pending")
        .lt("created_at", new Date(now.getTime() - LEASE_TTL_MS).toISOString());
      if (expiry.error) fail("acquireFetchLease (expire)", expiry.error);

      const { data, error } = await client
        .from("fetch_log")
        .insert({ symbol, interval, status: "pending", credits_used: 1, created_at: now.toISOString() })
        .select("id")
        .single();
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return null;
        fail("acquireFetchLease", error);
      }
      return data.id;
    },

    async completeFetchLease(id: number, completion: FetchCompletion, now: Date) {
      const { error } = await client
        .from("fetch_log")
        .update({
          status: completion.status,
          credits_used: completion.creditsUsed,
          candles_received: completion.candlesReceived,
          message: completion.message,
          completed_at: now.toISOString(),
        })
        .eq("id", id);
      if (error) fail("completeFetchLease", error);
    },
  };
}
