import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/data-provider/types";
import { toQuote } from "./quote";

// synthetic test data, not real prices
const bar = (date: string, close: number): Candle => ({
  ts: `${date}T00:00:00.000Z`,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

// Wed 25 Nov 2026 17:00 UTC = Thu 06:00 NZDT; expected latest bar is Tue 24 Nov (before 18:00 ET Wed)
const now = new Date("2026-11-25T17:00:00Z");

describe("toQuote", () => {
  it("returns null for no candles", () => {
    expect(toQuote([], null, now)).toBeNull();
  });

  it("computes a positive change", () => {
    const q = toQuote([bar("2026-11-23", 100), bar("2026-11-24", 102)], null, now);
    expect(q?.lastClose).toBe(102);
    expect(q?.prevClose).toBe(100);
    expect(q?.changePct).toBeCloseTo(2, 10);
    expect(q?.asOf).toBe(Date.parse("2026-11-24T00:00:00.000Z") / 1000);
  });

  it("computes a negative change", () => {
    const q = toQuote([bar("2026-11-23", 50), bar("2026-11-24", 49)], null, now);
    expect(q?.changePct).toBeCloseTo(-2, 10);
  });

  it("uses only the last two candles", () => {
    const q = toQuote([bar("2026-11-20", 1), bar("2026-11-23", 100), bar("2026-11-24", 110)], null, now);
    expect(q?.prevClose).toBe(100);
    expect(q?.changePct).toBeCloseTo(10, 10);
  });

  it("has null prevClose and changePct for a single candle", () => {
    const q = toQuote([bar("2026-11-24", 10)], null, now);
    expect(q).toMatchObject({ lastClose: 10, prevClose: null, changePct: null });
  });

  it("has null changePct when the previous close is 0", () => {
    const q = toQuote([bar("2026-11-23", 0), bar("2026-11-24", 5)], null, now);
    expect(q?.prevClose).toBe(0);
    expect(q?.changePct).toBeNull();
  });

  it("is not stale when the last bar is the expected one, and stale once the 18:00 ET cutoff passes", () => {
    const recent = [bar("2026-11-23", 1), bar("2026-11-24", 2)];
    expect(toQuote(recent, null, new Date("2026-11-25T22:59:00Z"))?.stale).toBe(false); // 17:59 ET
    expect(toQuote(recent, null, new Date("2026-11-25T23:00:00Z"))?.stale).toBe(true); // 18:00 ET
  });

  it("is not stale after the cutoff when an ok fetch happened after it (holiday clause)", () => {
    const thu = new Date("2026-11-27T01:00:00Z"); // Thu 26 Nov 20:00 ET (Thanksgiving)
    const recent = [bar("2026-11-24", 1), bar("2026-11-25", 2)];
    expect(toQuote(recent, new Date("2026-11-26T23:30:00Z"), thu)?.stale).toBe(false);
    expect(toQuote(recent, new Date("2026-11-26T22:00:00Z"), thu)?.stale).toBe(true);
  });
});
