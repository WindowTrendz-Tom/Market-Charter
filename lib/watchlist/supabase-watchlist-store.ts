import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreError } from "@/lib/cache/candle-store";
import type { Database } from "@/lib/supabase/database.types";
import type { WatchlistStore } from "./watchlist-store";

const UNIQUE_VIOLATION = "23505";

function fail(operation: string, error: { message: string }): never {
  throw new StoreError(`Supabase watchlist ${operation} failed: ${error.message}`, error);
}

/**
 * `client` must be the user-scoped server client (publishable key + the user's session), never the admin client:
 * RLS (`auth.uid() = user_id`) is the access control, and inserts rely on the `user_id` default `auth.uid()`.
 */
export function createSupabaseWatchlistStore(client: SupabaseClient<Database>): WatchlistStore {
  return {
    async list() {
      const { data, error } = await client
        .from("watchlist")
        .select("symbol,sort_order")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) fail("list", error);
      return (data ?? []).map((r) => ({ symbol: r.symbol, sortOrder: r.sort_order }));
    },

    async insert(symbol, sortOrder) {
      const { error } = await client.from("watchlist").insert({ symbol, sort_order: sortOrder });
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return "duplicate";
        fail("insert", error);
      }
      return "ok";
    },

    async remove(symbol) {
      const { data, error } = await client.from("watchlist").delete().eq("symbol", symbol).select("symbol");
      if (error) fail("remove", error);
      return (data ?? []).length > 0;
    },

    async setSortOrders(updates) {
      const results = await Promise.all(
        updates.map((u) => client.from("watchlist").update({ sort_order: u.sortOrder }).eq("symbol", u.symbol)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) fail("setSortOrders", failed.error);
    },
  };
}
