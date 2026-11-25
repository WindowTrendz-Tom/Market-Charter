import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface AuthContext {
  supabase: SupabaseClient<Database>;
  user: SessionUser | null;
}

/** Verifies the session JWT with getClaims(). A ConfigError from client creation propagates. */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  const user: SessionUser | null = claims?.sub
    ? { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null }
    : null;
  return { supabase, user };
}
