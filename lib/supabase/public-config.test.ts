import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "@/lib/config-error";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";

afterEach(() => vi.unstubAllEnvs());

describe("getSupabasePublicConfig", () => {
  it("reports every missing name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    try {
      getSupabasePublicConfig();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).missing).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ]);
    }
  });

  it("trims values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://x.supabase.co ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", " sb_publishable_test ");
    expect(getSupabasePublicConfig()).toEqual({ url: "https://x.supabase.co", publishableKey: "sb_publishable_test" });
  });
});
