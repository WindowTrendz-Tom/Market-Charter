import { createSupabaseCandleStore } from "@/lib/cache/supabase-candle-store";
import type { CandlesResponse, ErrorCode, ErrorResponse } from "@/lib/candles/api-types";
import { getChartCandles } from "@/lib/candles/get-chart-candles";
import { getDataProvider } from "@/lib/data-provider";
import { SUPPORTED_INTERVALS, type Interval } from "@/lib/data-provider/types";
import { ConfigError } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normaliseSymbol } from "@/lib/symbol";

export const dynamic = "force-dynamic";

function isInterval(value: string): value is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(value);
}

function errorResponse(
  status: number,
  code: ErrorCode,
  message: string,
  retryAfterSeconds: number | null = null,
): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfterSeconds !== null) headers["Retry-After"] = String(retryAfterSeconds);
  const body: ErrorResponse = { error: { code, message } };
  return Response.json(body, { status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<Response> {
  const raw = (await params).symbol;
  const symbol = normaliseSymbol(raw);
  if (symbol === null) {
    return errorResponse(
      400,
      "invalid_symbol",
      `"${raw.slice(0, 20)}" isn't a valid ticker. Use 1–10 letters, digits, '.' or '-', e.g. AAPL.`,
    );
  }

  const interval = new URL(request.url).searchParams.get("interval") ?? "1day";
  if (!isInterval(interval)) {
    return errorResponse(400, "invalid_interval", "Only daily candles (1day) are available.");
  }

  try {
    let deps: Parameters<typeof getChartCandles>[2];
    try {
      deps = { store: createSupabaseCandleStore(createSupabaseAdminClient()), provider: getDataProvider() };
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("Missing env:", err.missing);
        return errorResponse(500, "config", "Server configuration is incomplete.");
      }
      throw err;
    }

    const result = await getChartCandles(symbol, interval, deps);
    if (!result.ok) {
      return errorResponse(result.status, result.error.code, result.error.message, result.retryAfterSeconds);
    }

    const body: CandlesResponse = {
      symbol,
      interval,
      candles: result.candles.map((c) => ({
        time: Date.parse(c.ts) / 1000,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      source: result.source,
      stale: result.stale,
      notice: result.notice,
    };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(`Candles route error (${symbol}):`, err instanceof Error ? err.message : "unknown error");
    return errorResponse(500, "provider_error", "Something went wrong loading candles. Check the server logs.");
  }
}
