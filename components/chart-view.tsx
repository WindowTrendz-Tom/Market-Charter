"use client";

import { useEffect, useState } from "react";
import { fetchWithAuthRetry } from "@/lib/http/fetch-with-auth-retry";
import type { CandlesResponse, ErrorResponse } from "@/lib/candles/api-types";
import { formatNzDate } from "@/lib/time/display";
import { CandleChart } from "./candle-chart";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; data: CandlesResponse }
  | { kind: "login"; symbol: string }
  | { kind: "error"; message: string };

const MAX_BUSY_RETRIES = 3;
const DEFAULT_RETRY_SECONDS = 3;

const sleep = (seconds: number) => new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

async function readErrorBody(res: Response): Promise<ErrorResponse["error"] | null> {
  try {
    const body = (await res.json()) as Partial<ErrorResponse> | null;
    return body?.error ?? null;
  } catch {
    return null;
  }
}

async function loadCandles(symbol: string, isCancelled: () => boolean): Promise<ViewState> {
  const url = `/api/candles/${encodeURIComponent(symbol)}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchWithAuthRetry(url);
    } catch {
      return { kind: "error", message: "Couldn't reach the server." };
    }
    if (res.ok) {
      try {
        const data = (await res.json()) as CandlesResponse;
        if (!Array.isArray(data.candles) || data.candles.length === 0) {
          return { kind: "error", message: "No candles to show." };
        }
        return { kind: "ready", data };
      } catch {
        return { kind: "error", message: `Something went wrong loading ${symbol}.` };
      }
    }
    if (res.status === 401) return { kind: "login", symbol };
    const error = await readErrorBody(res);
    if (res.status === 503 && error?.code === "busy" && attempt < MAX_BUSY_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? DEFAULT_RETRY_SECONDS);
      await sleep(Number.isFinite(retryAfter) ? retryAfter : DEFAULT_RETRY_SECONDS);
      if (isCancelled()) return { kind: "loading" };
      continue;
    }
    return { kind: "error", message: error?.message ?? `Something went wrong loading ${symbol}.` };
  }
}

export function ChartView({ symbol }: { symbol: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const next = await loadCandles(symbol, () => cancelled);
      if (!cancelled) setState(next);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (state.kind === "loading") return <p>Loading {symbol}…</p>;
  if (state.kind === "login") {
    return (
      <div className="error" role="alert">
        Your session has expired.{" "}
        <a href={`/login?next=${encodeURIComponent(`/chart/${state.symbol}`)}`}>Log in again</a>.
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="error" role="alert">
        {state.message}
      </div>
    );
  }

  const { candles, notice, source, stale } = state.data;
  const last = candles[candles.length - 1];
  return (
    <>
      {notice && (
        <div className="notice" role="status">
          {notice.message}
        </div>
      )}
      <CandleChart candles={candles} />
      <p>
        Last candle: {formatNzDate(last.time)} · Source:{" "}
        {source === "cache" ? "Supabase cache" : "Twelve Data (just fetched)"}
        {stale ? " (may be out of date)" : ""}
      </p>
    </>
  );
}
