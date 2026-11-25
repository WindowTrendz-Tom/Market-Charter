import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "@/lib/env";
import type { Database } from "./database.types";

/** Service-level client. Bypasses RLS: import only from server-only modules. */
export function createSupabaseAdminClient(options?: { fetch?: typeof fetch }): SupabaseClient<Database> {
  const { url, secretKey } = getSupabaseAdminConfig();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(options?.fetch ? { global: { fetch: options.fetch } } : {}),
  });
}
