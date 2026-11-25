import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseCandleStore } from "@/lib/cache/supabase-candle-store";
import { getDataProvider } from "@/lib/data-provider";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseWatchlistStore } from "./supabase-watchlist-store";
import type { WatchlistDeps } from "./watchlist-service";

/**
 * The watchlist is read and written through the user's own session client (RLS applies).
 * Only the shared candle cache uses the admin client. May throw ConfigError.
 */
export function buildWatchlistDeps(supabase: SupabaseClient<Database>): WatchlistDeps {
  return {
    watchlist: createSupabaseWatchlistStore(supabase),
    candles: createSupabaseCandleStore(createSupabaseAdminClient()),
    provider: getDataProvider(),
  };
}
