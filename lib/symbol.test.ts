import { describe, expect, it } from "vitest";
import { normaliseSymbol } from "./symbol";

describe("normaliseSymbol", () => {
  it("trims and uppercases valid symbols", () => {
    expect(normaliseSymbol("aapl")).toBe("AAPL");
    expect(normaliseSymbol(" brk.b ")).toBe("BRK.B");
    expect(normaliseSymbol("BF-B")).toBe("BF-B");
  });
  it("rejects invalid symbols", () => {
    for (const bad of ["", "1ABC", "AAPL;DROP", "A/B", "ABCDEFGHIJK"]) {
      expect(normaliseSymbol(bad)).toBeNull();
    }
  });
});
