import { describe, expect, it } from "vitest";
import { toChartData } from "./to-chart-data";

const bar = (time: number, open: number) => ({ time, open, high: open + 2, low: open - 1, close: open + 1, volume: 100 });

describe("toChartData", () => {
  it("sorts ascending, drops duplicate times and keeps only OHLC fields", () => {
    const out = toChartData([bar(300, 3), bar(100, 1), bar(200, 2), bar(100, 9)]);
    expect(out).toEqual([
      { time: 100, open: 1, high: 3, low: 0, close: 2 },
      { time: 200, open: 2, high: 4, low: 1, close: 3 },
      { time: 300, open: 3, high: 5, low: 2, close: 4 },
    ]);
  });

  it("returns an empty array for no candles and does not mutate the input", () => {
    expect(toChartData([])).toEqual([]);
    const input = [bar(2, 1), bar(1, 1)];
    toChartData(input);
    expect(input.map((c) => c.time)).toEqual([2, 1]);
  });
});
