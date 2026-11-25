import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, getSupabaseAdminConfig, getTwelveDataApiKey } from "@/lib/env";

afterEach(() => vi.unstubAllEnvs());

function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("getTwelveDataApiKey", () => {
  it("throws ConfigError naming the missing variable", () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    const err = catchError(getTwelveDataApiKey);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).missing).toEqual(["TWELVE_DATA_API_KEY"]);
  });

  it("treats whitespace-only as missing", () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "   ");
    expect(() => getTwelveDataApiKey()).toThrow(ConfigError);
  });

  it("returns the trimmed value", () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "  td-test-key  ");
    expect(getTwelveDataApiKey()).toBe("td-test-key");
  });
});

describe("getSupabaseAdminConfig", () => {
  it("lists every missing name", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const err = catchError(getSupabaseAdminConfig) as ConfigError;
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.missing).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  });

  it("lists only the one that is missing, and never leaks the other value", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example-secret-host.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "  ");
    const err = catchError(getSupabaseAdminConfig) as ConfigError;
    expect(err.missing).toEqual(["SUPABASE_SECRET_KEY"]);
    expect(err.message).not.toContain("example-secret-host");
  });

  it("returns trimmed values when present", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://abc.supabase.co ");
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_test ");
    expect(getSupabaseAdminConfig()).toEqual({ url: "https://abc.supabase.co", secretKey: "sb_secret_test" });
  });
});
