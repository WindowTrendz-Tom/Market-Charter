import { describe, expect, it } from "vitest";
import { invalidSymbolMessage, normaliseSymbol } from "./symbol";

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

describe("invalidSymbolMessage", () => {
  it("quotes the input and gives an example", () => {
    expect(invalidSymbolMessage("A;B")).toBe(
      `"A;B" isn't a valid ticker. Use 1–10 letters, digits, '.' or '-', e.g. AAPL.`,
    );
  });
  it("truncates long input to 20 characters", () => {
    expect(invalidSymbolMessage("X".repeat(50))).toContain(`"${"X".repeat(20)}"`);
    expect(invalidSymbolMessage("X".repeat(50))).not.toContain("X".repeat(21));
  });
});
