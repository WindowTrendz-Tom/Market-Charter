import { describe, expect, it } from "vitest";
import { changeClass, formatChangePct, formatPrice } from "./format";

const norm = (s: string) => s.replace(/\s/g, "").replace("−", "-");

describe("formatPrice", () => {
  it.each([
    [212.4, "212.40"],
    [0.12345, "0.1235"],
    [1234.5, "1,234.50"],
  ])("%s -> %s", (v, expected) => {
    expect(norm(formatPrice(v))).toBe(expected);
  });
});

describe("formatChangePct", () => {
  it.each([
    [1.234, "+1.23%"],
    [-0.456, "-0.46%"],
    [0, "0.00%"],
  ])("%s -> %s", (v, expected) => {
    expect(norm(formatChangePct(v))).toBe(expected);
  });
  it("shows an em dash for null", () => {
    expect(formatChangePct(null)).toBe("—");
  });
});

describe("changeClass", () => {
  it("classifies up, down and flat", () => {
    expect(changeClass(0.01)).toBe("up");
    expect(changeClass(-0.01)).toBe("down");
    expect(changeClass(0)).toBe("flat");
    expect(changeClass(null)).toBe("flat");
  });
});
