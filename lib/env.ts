import "server-only";
import { readEnv } from "@/lib/config-error";

export { ConfigError } from "@/lib/config-error";

export function getTwelveDataApiKey(): string {
  return readEnv(["TWELVE_DATA_API_KEY"]).TWELVE_DATA_API_KEY;
}

export function getSupabaseAdminConfig(): { url: string; secretKey: string } {
  const env = readEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY };
}
