import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { ApiCandle } from "@/lib/candles/api-types";

/** Sorted ascending by time, one bar per timestamp (the first one wins). */
export function toChartData(candles: ApiCandle[]): CandlestickData<UTCTimestamp>[] {
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const out: CandlestickData<UTCTimestamp>[] = [];
  for (const c of sorted) {
    if (out.length > 0 && out[out.length - 1].time === c.time) continue;
    out.push({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return out;
}
