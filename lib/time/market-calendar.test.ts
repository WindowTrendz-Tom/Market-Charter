import { describe, expect, it } from "vitest";
import {
  dailyCutoffInstant,
  dailyTsToDate,
  dateToDailyTs,
  expectedLatestDailyCandleDate,
  isDailyCacheFresh,
} from "./market-calendar";

describe("expectedLatestDailyCandleDate", () => {
  const cases: [string, string, string][] = [
    ["Wed 12:00 ET", "2026-11-25T17:00:00Z", "2026-11-24"],
    ["Wed 18:00 ET exactly", "2026-11-25T23:00:00Z", "2026-11-25"],
    ["Wed 17:59 ET", "2026-11-25T22:59:00Z", "2026-11-24"],
    ["Saturday", "2026-11-28T15:00:00Z", "2026-11-27"],
    ["Sunday evening", "2026-11-29T23:30:00Z", "2026-11-27"],
    ["Monday 09:00 ET", "2026-11-30T14:00:00Z", "2026-11-27"],
    ["NZ morning (Thu 09:00 NZDT)", "2026-11-25T20:00:00Z", "2026-11-24"],
  ];
  it.each(cases)("%s", (_label, instant, expected) => {
    expect(expectedLatestDailyCandleDate(new Date(instant))).toBe(expected);
  });
});

describe("dailyCutoffInstant", () => {
  it("handles DST and standard time", () => {
    expect(dailyCutoffInstant("2026-10-30").toISOString()).toBe("2026-10-30T22:00:00.000Z");
    expect(dailyCutoffInstant("2026-11-02").toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(dailyCutoffInstant("2026-03-06").toISOString()).toBe("2026-03-06T23:00:00.000Z");
    expect(dailyCutoffInstant("2026-03-09").toISOString()).toBe("2026-03-09T22:00:00.000Z");
  });
});

describe("isDailyCacheFresh", () => {
  const now = new Date("2026-11-25T17:00:00Z"); // expected 2026-11-24
  it("is false for an empty cache", () => {
    expect(isDailyCacheFresh({ latestCachedTs: null, lastOkFetchAt: null, now })).toBe(false);
  });
  it("is true when latest equals expected", () => {
    expect(isDailyCacheFresh({ latestCachedTs: "2026-11-24T00:00:00.000Z", lastOkFetchAt: null, now })).toBe(true);
  });
  it("is false when older and never fetched", () => {
    expect(isDailyCacheFresh({ latestCachedTs: "2026-11-23T00:00:00.000Z", lastOkFetchAt: null, now })).toBe(false);
  });
  it("covers a holiday via the last ok fetch (Thanksgiving)", () => {
    const thu = new Date("2026-11-27T01:00:00Z"); // Thu 26 Nov 20:00 ET
    const latestCachedTs = "2026-11-25T00:00:00.000Z";
    expect(isDailyCacheFresh({ latestCachedTs, lastOkFetchAt: new Date("2026-11-26T23:30:00Z"), now: thu })).toBe(true);
    expect(isDailyCacheFresh({ latestCachedTs, lastOkFetchAt: new Date("2026-11-26T22:00:00Z"), now: thu })).toBe(false);
  });
});

describe("daily ts helpers", () => {
  it("round-trips dates", () => {
    expect(dateToDailyTs("2026-11-24")).toBe("2026-11-24T00:00:00.000Z");
    expect(dailyTsToDate("2026-11-24T00:00:00+00:00")).toBe("2026-11-24");
  });
});
