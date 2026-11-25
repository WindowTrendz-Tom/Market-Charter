import "server-only";

export class ConfigError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(`Missing required environment variable(s): ${missing.join(", ")}`);
    this.name = "ConfigError";
    this.missing = missing;
  }
}

function readEnv<K extends string>(names: readonly K[]): Record<K, string> {
  const values = {} as Record<K, string>;
  const missing: string[] = [];
  for (const name of names) {
    const value = process.env[name]?.trim() ?? "";
    if (value === "") missing.push(name);
    else values[name] = value;
  }
  if (missing.length > 0) throw new ConfigError(missing);
  return values;
}

export function getTwelveDataApiKey(): string {
  return readEnv(["TWELVE_DATA_API_KEY"]).TWELVE_DATA_API_KEY;
}

export function getSupabaseAdminConfig(): { url: string; secretKey: string } {
  const env = readEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY };
}
