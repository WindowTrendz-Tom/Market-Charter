import { describe } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { runCandleStoreContract } from "@/test/helpers/candle-store-contract";
import { createSupabaseCandleStore } from "./supabase-candle-store";

// Opt-in: vitest does not load .env.local, so export it first:
//   set -a; . ./.env.local; set +a; RUN_SUPABASE_TESTS=1 npm test
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const enabled = process.env.RUN_SUPABASE_TESTS === "1" && Boolean(url) && Boolean(key);

describe.skipIf(!enabled)("Supabase integration", () => {
  runCandleStoreContract(
    "SupabaseCandleStore (real project)",
    async () => {
      const client = createClient<Database>(url as string, key as string, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      // Deletes only this suite's own test rows (symbol like 'ZZTEST%').
      const cleanup = async () => {
        for (const table of ["candles", "fetch_log"] as const) {
          const { error } = await client.from(table).delete().like("symbol", "ZZTEST%");
          if (error) throw new Error(`cleanup of ${table} failed: ${error.message}`);
        }
      };
      await cleanup(); // clear leftovers from an interrupted run
      return { store: createSupabaseCandleStore(client), cleanup };
    },
    "ZZTEST",
  );
});
