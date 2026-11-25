import { describe, expect, it } from "vitest";
import fixture from "@/test/fixtures/twelve-data-time-series-1day.json";
import searchFixture from "@/test/fixtures/twelve-data-symbol-search.json";
import { INITIAL_OUTPUTSIZE, TwelveDataProvider } from "./twelve-data";
import { ProviderError } from "./types";

// synthetic test data, not real prices
interface Call {
  url: string;
  init: RequestInit | undefined;
}

function makeProvider(respond: () => Response | Promise<Response> | never) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    expect(new URL(url).host).toBe("api.twelvedata.com");
    calls.push({ url, init });
    return respond();
  }) as typeof fetch;
  return { provider: new TwelveDataProvider({ apiKey: "test-key", fetchImpl }), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ProviderError) return e.kind;
    throw e;
  }
  return "no error";
}

describe("TwelveDataProvider", () => {
  it("maps the fixture, ascending, with numbers and null volume", async () => {
    const { provider } = makeProvider(() => json(fixture));
    const candles = await provider.getCandles("TEST", "1day");
    expect(candles).toHaveLength(6);
    expect(candles[0].ts).toBe("2026-11-17T00:00:00.000Z");
    expect(candles[5].ts).toBe("2026-11-24T00:00:00.000Z");
    expect(candles[5]).toMatchObject({ open: 150.1, high: 152, low: 149.5, close: 151.25, volume: 1200000 });
    const noVolume = candles.find((c) => c.ts.startsWith("2026-11-20"));
    expect(noVolume?.volume).toBeNull();
    for (let i = 1; i < candles.length; i++) expect(candles[i].ts > candles[i - 1].ts).toBe(true);
  });

  it("backfill request: outputsize only, no start_date, no order", async () => {
    const { provider, calls } = makeProvider(() => json(fixture));
    await provider.getCandles("TEST", "1day");
    const params = new URL(calls[0].url).searchParams;
    expect(params.has("order")).toBe(false);
    expect(Object.fromEntries(params)).toEqual({ symbol: "TEST", interval: "1day", outputsize: String(INITIAL_OUTPUTSIZE) });
    expect(INITIAL_OUTPUTSIZE).toBe(5000);
  });

  it("incremental request: start_date only, no outputsize, no order", async () => {
    const { provider, calls } = makeProvider(() => json(fixture));
    await provider.getCandles("TEST", "1day", "2026-11-20");
    const params = new URL(calls[0].url).searchParams;
    expect(params.has("order")).toBe(false);
    expect(params.has("outputsize")).toBe(false);
    expect(Object.fromEntries(params)).toEqual({ symbol: "TEST", interval: "1day", start_date: "2026-11-20" });
  });

  it("sends the key in the Authorization header, not the URL", async () => {
    const { provider, calls } = makeProvider(() => json(fixture));
    await provider.getCandles("TEST", "1day");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("apikey test-key");
    expect(calls[0].url).not.toContain("test-key");
  });

  it("maps HTTP 429 to rate_limited", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 429, message: "run out of API credits" }, 429));
    expect(await kindOf(provider.getCandles("TEST", "1day"))).toBe("rate_limited");
  });

  it("maps HTTP 200 with an error body code 429 to rate_limited", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 429, message: "run out of API credits" }, 200));
    expect(await kindOf(provider.getCandles("TEST", "1day"))).toBe("rate_limited");
  });

  it("maps 401 to auth and 403 to forbidden", async () => {
    const a = makeProvider(() => json({ status: "error", code: 401, message: "bad key" }, 401));
    expect(await kindOf(a.provider.getCandles("TEST", "1day"))).toBe("auth");
    const f = makeProvider(() => json({ status: "error", code: 403, message: "plan" }, 403));
    expect(await kindOf(f.provider.getCandles("TEST", "1day"))).toBe("forbidden");
  });

  it("maps 400 symbol not found to not_found", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 400, message: "**symbol** not found: XYZ" }, 400));
    expect(await kindOf(provider.getCandles("XYZ", "1day"))).toBe("not_found");
  });

  it("maps 400 invalid interval to bad_response", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 400, message: "Invalid **interval** provided" }, 400));
    expect(await kindOf(provider.getCandles("TEST", "1day"))).toBe("bad_response");
  });

  it("returns [] for 400 no data available", async () => {
    const { provider } = makeProvider(() =>
      json({ status: "error", code: 400, message: "No data is available on the specified dates" }, 400),
    );
    expect(await provider.getCandles("TEST", "1day", "2026-11-25")).toEqual([]);
  });

  it("maps 500 and fetch failures to unavailable", async () => {
    const s = makeProvider(() => json({ status: "error", code: 500, message: "oops" }, 500));
    expect(await kindOf(s.provider.getCandles("TEST", "1day"))).toBe("unavailable");
    const n = makeProvider(() => {
      throw new TypeError("network down");
    });
    expect(await kindOf(n.provider.getCandles("TEST", "1day"))).toBe("unavailable");
  });

  it("maps a non-JSON body to bad_response (200) or unavailable (502)", async () => {
    const a = makeProvider(() => new Response("<html>", { status: 200 }));
    expect(await kindOf(a.provider.getCandles("TEST", "1day"))).toBe("bad_response");
    const b = makeProvider(() => new Response("<html>", { status: 502 }));
    expect(await kindOf(b.provider.getCandles("TEST", "1day"))).toBe("unavailable");
  });

  it("maps a garbage value to bad_response", async () => {
    const bad = { ...fixture, values: [{ ...fixture.values[0], open: "abc" }] };
    const { provider } = makeProvider(() => json(bad));
    expect(await kindOf(provider.getCandles("TEST", "1day"))).toBe("bad_response");
  });

  it("error messages never contain the key or URL", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 401, message: "bad key" }, 401));
    const err = await provider.getCandles("TEST", "1day").then(
      () => new Error("did not throw"),
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).not.toContain("test-key");
    expect(err.message).not.toContain("http");
  });
});

describe("searchSymbols", () => {
  it("maps the fixture in provider order and skips items without a symbol", async () => {
    const { provider } = makeProvider(() => json(searchFixture));
    const matches = await provider.searchSymbols("AAPL");
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({
      symbol: "AAPL",
      name: "Apple Inc",
      exchange: "NASDAQ",
      micCode: "XNGS",
      country: "United States",
      instrumentType: "Common Stock",
      currency: "USD",
    });
    expect(matches.map((m) => m.exchange)).toEqual(["NASDAQ", "BMV", "NYSE"]);
  });

  it("requests /symbol_search with symbol and outputsize only", async () => {
    const { provider, calls } = makeProvider(() => json(searchFixture));
    await provider.searchSymbols("AAPL");
    const url = new URL(calls[0].url);
    expect(url.host).toBe("api.twelvedata.com");
    expect(url.pathname).toBe("/symbol_search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ symbol: "AAPL", outputsize: "30" });
  });

  it("sends the key only in the Authorization header", async () => {
    const { provider, calls } = makeProvider(() => json(searchFixture));
    await provider.searchSymbols("AAPL");
    expect(new Headers(calls[0].init?.headers).get("Authorization")).toBe("apikey test-key");
    expect(calls[0].url).not.toContain("test-key");
  });

  it("maps an error body code 429 to rate_limited", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 429, message: "run out of API credits" }, 200));
    expect(await kindOf(provider.searchSymbols("AAPL"))).toBe("rate_limited");
  });

  it("maps a response without data to bad_response", async () => {
    const { provider } = makeProvider(() => json({ status: "ok" }));
    expect(await kindOf(provider.searchSymbols("AAPL"))).toBe("bad_response");
  });

  it("returns [] for an empty data array", async () => {
    const { provider } = makeProvider(() => json({ data: [], status: "ok" }));
    expect(await provider.searchSymbols("ZZZZ")).toEqual([]);
  });

  it("maps a 500 to unavailable", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 500, message: "oops" }, 500));
    expect(await kindOf(provider.searchSymbols("AAPL"))).toBe("unavailable");
  });

  it("error messages never contain the key or URL", async () => {
    const { provider } = makeProvider(() => json({ status: "error", code: 401, message: "bad key" }, 401));
    const err = await provider.searchSymbols("AAPL").then(
      () => new Error("did not throw"),
      (e: unknown) => e as Error,
    );
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).not.toContain("test-key");
    expect(err.message).not.toContain("http");
  });
});
