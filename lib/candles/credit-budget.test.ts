import { describe, expect, it } from "vitest";
import { MemoryCandleStore } from "@/test/helpers/memory-candle-store";
import { checkCreditBudget, secondsUntilNextUtcMidnight, startOfUtcDay } from "./credit-budget";
import { LIMIT_MESSAGES } from "./messages";

const NOW = new Date("2026-11-25T17:00:00Z");
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

function seedCredits(store: MemoryCandleStore, count: number, at: (i: number) => Date) {
  for (let i = 0; i < count; i++) {
    store.seedLog({ symbol: "AAPL", interval: "1day", status: "ok", creditsUsed: 1, createdAt: at(i) });
  }
}

describe("checkCreditBudget", () => {
  it("allows a call with 7 credits in the last minute", async () => {
    const store = new MemoryCandleStore();
    seedCredits(store, 7, (i) => secondsAgo(5 + i));
    await expect(checkCreditBudget(store, NOW)).resolves.toBeNull();
  });

  it("refuses with the minute limit when 8 credits were used within 60 s", async () => {
    const store = new MemoryCandleStore();
    seedCredits(store, 8, (i) => secondsAgo(5 + i * 5));
    await expect(checkCreditBudget(store, NOW)).resolves.toEqual({
      kind: "minute",
      message: LIMIT_MESSAGES.minute,
      retryAfterSeconds: 60,
    });
  });

  it("counts symbol_search credits towards the minute limit", async () => {
    const store = new MemoryCandleStore();
    seedCredits(store, 7, (i) => secondsAgo(5 + i));
    store.seedLog({ symbol: "MSFT", interval: "symbol_search", status: "ok", creditsUsed: 1, createdAt: secondsAgo(2) });
    await expect(checkCreditBudget(store, NOW)).resolves.toMatchObject({ kind: "minute" });
  });

  it("refuses with the day limit when 800 credits were used since UTC midnight, spread wider than a minute", async () => {
    const store = new MemoryCandleStore();
    // 800 credits, one every 70 s from 00:00:30Z, the last one more than a minute before 17:00Z.
    seedCredits(store, 800, (i) => new Date(Date.UTC(2026, 10, 25, 0, 0, 30) + i * 70_000));
    await expect(checkCreditBudget(store, NOW)).resolves.toEqual({
      kind: "day",
      message: LIMIT_MESSAGES.day,
      retryAfterSeconds: 7 * 3600,
    });
  });

  it("ignores credits from before UTC midnight", async () => {
    const store = new MemoryCandleStore();
    seedCredits(store, 800, () => new Date("2026-11-24T23:59:59Z"));
    await expect(checkCreditBudget(store, NOW)).resolves.toBeNull();
  });
});

describe("UTC day helpers", () => {
  it("startOfUtcDay is midnight UTC of the same day", () => {
    expect(startOfUtcDay(NOW).toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });

  it("secondsUntilNextUtcMidnight rounds up and is at least 1", () => {
    expect(secondsUntilNextUtcMidnight(NOW)).toBe(7 * 3600);
    expect(secondsUntilNextUtcMidnight(new Date("2026-11-25T23:59:59.500Z"))).toBe(1);
  });
});
