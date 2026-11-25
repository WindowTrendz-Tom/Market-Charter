import { getAuthContext } from "@/lib/auth/session";
import { createSupabaseCandleStore } from "@/lib/cache/supabase-candle-store";
import type { CandlesResponse } from "@/lib/candles/api-types";
import { getChartCandles } from "@/lib/candles/get-chart-candles";
import { getDataProvider } from "@/lib/data-provider";
import { SUPPORTED_INTERVALS, type Interval } from "@/lib/data-provider/types";
import { ConfigError } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { errorJson, jsonNoStore } from "@/lib/http/json";
import { invalidSymbolMessage, normaliseSymbol } from "@/lib/symbol";

export const dynamic = "force-dynamic";

function isInterval(value: string): value is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(value);
}

export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> }): Promise<Response> {
  const raw = (await params).symbol;
  const symbol = normaliseSymbol(raw);

  try {
    try {
      const { user } = await getAuthContext();
      if (!user) return errorJson(401, "unauthorized", "Log in to load charts.");
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("Missing env:", err.missing);
        return errorJson(500, "config", "Server configuration is incomplete.");
      }
      throw err;
    }

    if (symbol === null) return errorJson(400, "invalid_symbol", invalidSymbolMessage(raw));

    const interval = new URL(request.url).searchParams.get("interval") ?? "1day";
    if (!isInterval(interval)) {
      return errorJson(400, "invalid_interval", "Only daily candles (1day) are available.");
    }

    let deps: Parameters<typeof getChartCandles>[2];
    try {
      deps = { store: createSupabaseCandleStore(createSupabaseAdminClient()), provider: getDataProvider() };
    } catch (err) {
      if (err instanceof ConfigError) {
        console.error("Missing env:", err.missing);
        return errorJson(500, "config", "Server configuration is incomplete.");
      }
      throw err;
    }

    const result = await getChartCandles(symbol, interval, deps);
    if (!result.ok) {
      return errorJson(result.status, result.error.code, result.error.message, result.retryAfterSeconds);
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
    return jsonNoStore(body);
  } catch (err) {
    console.error(`Candles route error (${symbol ?? "invalid"}):`, err instanceof Error ? err.message : "unknown error");
    return errorJson(500, "provider_error", "Something went wrong loading candles. Check the server logs.");
  }
}
