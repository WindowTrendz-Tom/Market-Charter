import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigError, readEnv } from "@/lib/config-error";

afterEach(() => vi.unstubAllEnvs());

describe("readEnv", () => {
  it("returns trimmed values", () => {
    vi.stubEnv("TEST_A", "  a  ");
    expect(readEnv(["TEST_A"])).toEqual({ TEST_A: "a" });
  });

  it("throws ConfigError listing every missing name", () => {
    vi.stubEnv("TEST_A", "");
    vi.stubEnv("TEST_B", "   ");
    try {
      readEnv(["TEST_A", "TEST_B"]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).missing).toEqual(["TEST_A", "TEST_B"]);
    }
  });
});
