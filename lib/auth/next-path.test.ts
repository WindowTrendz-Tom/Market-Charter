import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/next-path";

describe("safeNextPath", () => {
  it("keeps safe paths", () => {
    expect(safeNextPath("/chart/AAPL")).toBe("/chart/AAPL");
    expect(safeNextPath("/chart/AAPL?x=1")).toBe("/chart/AAPL?x=1");
  });

  it.each([
    ["//evil.com", "//evil.com"],
    ["backslash", "/\\evil.com"],
    ["absolute url", "https://evil.com"],
    ["javascript url", "javascript:alert(1)"],
    ["empty", ""],
    ["login", "/login"],
    ["login with query", "/login?next=/x"],
    ["too long", "/" + "a".repeat(200)],
    ["tab", "/\t/evil.com"],
    ["LF", "/\n/evil.com"],
    ["CR", "/\r/evil.com"],
    ["DEL", "/\u007F/x"],
    ["null", null],
    ["number", 42],
  ])("falls back to / for %s", (_label, value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
