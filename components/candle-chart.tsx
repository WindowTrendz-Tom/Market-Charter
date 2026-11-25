"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, createChart } from "lightweight-charts";
import type { TickMarkType, Time } from "lightweight-charts";
import type { ApiCandle } from "@/lib/candles/api-types";
import { toChartData } from "@/lib/chart/to-chart-data";
import { formatNzDate, nzTickMarkLabel } from "@/lib/time/display";

export function CandleChart({ candles }: { candles: ApiCandle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { attributionLogo: true },
      localization: {
        locale: "en-NZ",
        timeFormatter: (t: Time) => (typeof t === "number" ? formatNzDate(t) : String(t)),
      },
      timeScale: {
        tickMarkFormatter: (t: Time, type: TickMarkType) =>
          typeof t === "number" ? nzTickMarkLabel(t, type) : null,
      },
    });
    const series = chart.addSeries(CandlestickSeries, {}, 0);
    series.setData(toChartData(candles));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div ref={containerRef} style={{ width: "100%", height: 480 }} />;
}
