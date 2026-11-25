import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { StoreError } from "./candle-store";
import { createSupabaseCandleStore } from "./supabase-candle-store";

// synthetic test data, not real prices
const SECRET = "test-secret";

interface Recorded {
  url: string;
  method: string;
  body: string;
}

function setup(respond: (req: Recorded, index: number) => Response) {
  const calls: Recorded[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const recorded = { url: req.url, method: req.method, body: await req.text() };
    calls.push(recorded);
    return respond(recorded, calls.length - 1);
  }) as typeof fetch;
  const client = createClient<Database>("https://example.supabase.co", SECRET, { global: { fetch: fakeFetch } });
  return { store: createSupabaseCandleStore(client), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const row = (i: number) => ({
  ts: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().replace("Z", "+00:00"),
  open: "1.5",
  high: 2,
  low: "1",
  close: 1.75,
  volume: i % 2 ? null : "1000",
});

const candle = (i: number) => ({ ts: new Date(Date.UTC(2020, 0, 1 + i)).toISOString(), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });

describe("createSupabaseCandleStore (fake fetch)", () => {
  it("(a) getCandles pages: 1000 then 5 rows gives 1005 numeric candles with ISO ts", async () => {
    const { store, calls } = setup((_req, i) => json(Array.from({ length: i === 0 ? 1000 : 5 }, (_, n) => row(i * 1000 + n))));
    const candles = await store.getCandles("TEST", "1day");
    expect(calls).toHaveLength(2);
    expect(candles).toHaveLength(1005);
    expect(typeof candles[0].open).toBe("number");
    expect(candles[0].open).toBe(1.5);
    expect(candles[0].volume).toBe(1000);
    expect(candles[1].volume).toBeNull();
    expect(candles[0].ts).toBe("2020-01-01T00:00:00.000Z");
  });

  it("(b) upsertCandles with 2500 rows makes 3 POSTs with on_conflict", async () => {
    const { store, calls } = setup(() => new Response(null, { status: 201 }));
    await store.upsertCandles("TEST", "1day", Array.from({ length: 2500 }, (_, i) => candle(i)));
    expect(calls).toHaveLength(3);
    for (const c of calls) {
      expect(c.method).toBe("POST");
      expect(decodeURIComponent(c.url)).toContain("on_conflict=symbol,interval,ts");
    }
    expect(JSON.parse(calls[2].body)).toHaveLength(500);
  });

  it("upsertCandles with no rows makes no requests", async () => {
    const { store, calls } = setup(() => new Response(null, { status: 201 }));
    await store.upsertCandles("TEST", "1day", []);
    expect(calls).toHaveLength(0);
  });

  it("(c) a unique violation on lease insert returns null", async () => {
    const { store } = setup((req) =>
      req.method === "PATCH"
        ? new Response(null, { status: 204 })
        : json({ code: "23505", message: "duplicate key value", details: null, hint: null }, 409),
    );
    expect(await store.acquireFetchLease("TEST", "1day", new Date("2026-11-25T00:00:00Z"))).toBeNull();
  });

  it("acquireFetchLease expires stale rows, then inserts with the injected clock", async () => {
    const now = new Date("2026-11-25T00:00:00.000Z");
    const { store, calls } = setup((req) => (req.method === "PATCH" ? new Response(null, { status: 204 }) : json({ id: 42 }, 201)));
    expect(await store.acquireFetchLease("TEST", "1day", now)).toBe(42);
    expect(calls.map((c) => c.method)).toEqual(["PATCH", "POST"]);
    expect(decodeURIComponent(calls[0].url)).toContain("created_at=lt.2026-11-24T23:59:00.000Z");
    expect(JSON.parse(calls[1].body)).toMatchObject({ status: "pending", credits_used: 1, created_at: now.toISOString() });
  });

  it("getRecentCandles orders descending, limits, and returns ascending", async () => {
    const { store, calls } = setup(() => json([row(2), row(1)]));
    const got = await store.getRecentCandles("TEST", "1day", 2);
    const url = decodeURIComponent(calls[0].url);
    expect(url).toContain("order=ts.desc");
    expect(url).toContain("limit=2");
    expect(got.map((c) => c.ts)).toEqual(["2020-01-02T00:00:00.000Z", "2020-01-03T00:00:00.000Z"]);
    expect(typeof got[0].close).toBe("number");
  });

  it("getRecentCandles throws StoreError on a failed request", async () => {
    const { store } = setup(() => json({ message: "boom" }, 500));
    await expect(store.getRecentCandles("TEST", "1day", 2)).rejects.toBeInstanceOf(StoreError);
    await expect(store.getRecentCandles("TEST", "1day", 2)).rejects.toThrow(/getRecentCandles failed/);
  });

  it("(d) a 500 response throws StoreError", async () => {
    const { store } = setup(() => json({ message: "boom" }, 500));
    await expect(store.getCandles("TEST", "1day")).rejects.toBeInstanceOf(StoreError);
    await expect(store.getCandles("TEST", "1day")).rejects.toThrow(/boom/);
  });

  it("(e) the secret never appears in any request URL or body", async () => {
    const { store, calls } = setup((req) => {
      if (req.method === "GET") return json([]);
      if (req.method === "PATCH") return new Response(null, { status: 204 });
      return json({ id: 1 }, 201);
    });
    await store.getCandles("TEST", "1day");
    await store.getLatestCandleTs("TEST", "1day");
    await store.upsertCandles("TEST", "1day", [candle(0)]);
    await store.getLastOkFetchAt("TEST", "1day");
    await store.sumCreditsSince(new Date(0));
    const id = await store.acquireFetchLease("TEST", "1day", new Date());
    await store.completeFetchLease(id as number, { status: "ok", creditsUsed: 1, candlesReceived: 1, message: null }, new Date());
    expect(calls.length).toBeGreaterThan(5);
    for (const c of calls) {
      expect(c.url).not.toContain(SECRET);
      expect(c.body).not.toContain(SECRET);
    }
  });
});
