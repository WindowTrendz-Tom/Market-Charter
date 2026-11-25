import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";
import type { Database } from "./database.types";

/** Per-request client bound to the user's session cookies (RLS applies). Never cache it. */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const { url, publishableKey } = getSupabasePublicConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // The cache headers (2nd setAll argument) are set by proxy.ts; cookies() cannot set headers.
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component render: proxy.ts refreshes the session.
        }
      },
    },
  });
}
