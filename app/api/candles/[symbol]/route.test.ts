import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartCandlesResult } from "@/lib/candles/get-chart-candles";
import type { CandlesResponse, ErrorResponse } from "@/lib/candles/api-types";
import { ConfigError } from "@/lib/env";
import { GET } from "./route";

vi.mock("@/lib/candles/get-chart-candles", () => ({ getChartCandles: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/cache/supabase-candle-store", () => ({ createSupabaseCandleStore: vi.fn(() => ({ fake: "store" })) }));
vi.mock("@/lib/data-provider", () => ({ getDataProvider: vi.fn(() => ({ fake: "provider" })) }));

const { getChartCandles } = await import("@/lib/candles/get-chart-candles");
const { getDataProvider } = await import("@/lib/data-provider");
const service = vi.mocked(getChartCandles);
const providerFactory = vi.mocked(getDataProvider);

const candle = { ts: "2026-11-24T05:00:00.000Z", open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 };

function call(symbol: string, query = "") {
  return GET(new Request(`http://localhost/api/candles/${symbol}${query}`), {
    params: Promise.resolve({ symbol }),
  });
}

beforeEach(() => {
  service.mockReset();
  providerFactory.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/candles/[symbol]", () => {
  it("returns candles with time in seconds and no-store", async () => {
    const ok: ChartCandlesResult = { ok: true, candles: [candle], source: "cache", stale: false, notice: null };
    service.mockResolvedValue(ok);
    const res = await call("aapl");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(service.mock.calls[0].slice(0, 2)).toEqual(["AAPL", "1day"]);
    const body = (await res.json()) as CandlesResponse;
    expect(body).toEqual({
      symbol: "AAPL",
      interval: "1day",
      candles: [{ time: Date.parse(candle.ts) / 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
      source: "cache",
      stale: false,
      notice: null,
    });
  });

  it("rejects an invalid symbol without calling the service", async () => {
    const res = await call("A;B");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("invalid_symbol");
    expect(service).not.toHaveBeenCalled();
  });

  it("rejects an unsupported interval", async () => {
    const res = await call("AAPL", "?interval=1h");
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorResponse).error.code).toBe("invalid_interval");
    expect(service).not.toHaveBeenCalled();
  });

  it("maps a rate-limited failure to 429 with Retry-After", async () => {
    service.mockResolvedValue({
      ok: false,
      status: 429,
      error: { code: "rate_limited", message: "limit" },
      retryAfterSeconds: 60,
    });
    const res = await call("AAPL");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(((await res.json()) as ErrorResponse).error.code).toBe("rate_limited");
  });

  it("maps a busy failure to 503 with Retry-After 3", async () => {
    service.mockResolvedValue({
      ok: false,
      status: 503,
      error: { code: "busy", message: "busy" },
      retryAfterSeconds: 3,
    });
    const res = await call("AAPL");
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3");
  });

  it("returns 500 config error without leaking details", async () => {
    process.env.TWELVE_DATA_API_KEY = "leakcheck-secret-value";
    providerFactory.mockImplementationOnce(() => {
      throw new ConfigError(["TWELVE_DATA_API_KEY"]);
    });
    const res = await call("AAPL");
    const text = await res.text();
    delete process.env.TWELVE_DATA_API_KEY;
    expect(res.status).toBe(500);
    expect((JSON.parse(text) as ErrorResponse).error.code).toBe("config");
    expect(text).not.toContain("leakcheck-secret-value");
    expect(text).not.toContain("TWELVE_DATA_API_KEY");
    expect(text).not.toContain(" at ");
    expect(service).not.toHaveBeenCalled();
  });

  it("returns 500 for an unexpected throw with a generic message", async () => {
    service.mockRejectedValue(new Error("secret internals"));
    const res = await call("AAPL");
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("secret internals");
    expect((JSON.parse(text) as ErrorResponse).error.code).toBe("provider_error");
  });

  it("passes a stale result with its notice through as 200", async () => {
    service.mockResolvedValue({
      ok: true,
      candles: [candle],
      source: "cache",
      stale: true,
      notice: { code: "rate_limited", message: "Showing cached data. limit" },
    });
    const res = await call("AAPL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as CandlesResponse;
    expect(body.stale).toBe(true);
    expect(body.notice?.code).toBe("rate_limited");
  });
});
