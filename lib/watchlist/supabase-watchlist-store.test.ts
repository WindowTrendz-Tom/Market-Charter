import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { StoreError } from "@/lib/cache/candle-store";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseWatchlistStore } from "./supabase-watchlist-store";

// synthetic test data, not real prices
const KEY = "test-publishable";

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
  const client = createClient<Database>("https://example.supabase.co", KEY, { global: { fetch: fakeFetch } });
  return { store: createSupabaseWatchlistStore(client), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createSupabaseWatchlistStore (fake fetch)", () => {
  it("list orders by sort_order then created_at and maps rows", async () => {
    const { store, calls } = setup(() =>
      json([
        { symbol: "ZZA", sort_order: 0 },
        { symbol: "ZZB", sort_order: 3 },
      ]),
    );
    expect(await store.list()).toEqual([
      { symbol: "ZZA", sortOrder: 0 },
      { symbol: "ZZB", sortOrder: 3 },
    ]);
    const url = decodeURIComponent(calls[0].url);
    expect(calls[0].method).toBe("GET");
    expect(url).toContain("/rest/v1/watchlist?");
    expect(url).toContain("select=symbol,sort_order");
    expect(url).toContain("order=sort_order.asc,created_at.asc");
  });

  it("insert sends symbol and sort_order only (no user_id) and returns ok", async () => {
    const { store, calls } = setup(() => new Response(null, { status: 201 }));
    expect(await store.insert("ZZA", 4)).toBe("ok");
    expect(calls[0].method).toBe("POST");
    const body = JSON.parse(calls[0].body);
    expect(body).toEqual({ symbol: "ZZA", sort_order: 4 });
    expect(body).not.toHaveProperty("user_id");
  });

  it("insert maps a unique violation (23505) to duplicate", async () => {
    const { store } = setup(() => json({ code: "23505", message: "duplicate key value", details: null, hint: null }, 409));
    expect(await store.insert("ZZA", 0)).toBe("duplicate");
  });

  it("insert throws StoreError on other errors", async () => {
    const { store } = setup(() => json({ code: "42501", message: "permission denied", details: null, hint: null }, 403));
    await expect(store.insert("ZZA", 0)).rejects.toBeInstanceOf(StoreError);
  });

  it("remove filters on symbol and returns true when a row was deleted", async () => {
    const { store, calls } = setup(() => json([{ symbol: "ZZA" }]));
    expect(await store.remove("ZZA")).toBe(true);
    expect(calls[0].method).toBe("DELETE");
    const url = decodeURIComponent(calls[0].url);
    expect(url).toContain("symbol=eq.ZZA");
    expect(url).toContain("select=symbol");
  });

  it("remove returns false when no row was deleted", async () => {
    const { store } = setup(() => json([]));
    expect(await store.remove("ZZA")).toBe(false);
  });

  it("setSortOrders sends one PATCH per update, filtered on symbol", async () => {
    const { store, calls } = setup(() => new Response(null, { status: 204 }));
    await store.setSortOrders([
      { symbol: "ZZC", sortOrder: 0 },
      { symbol: "ZZA", sortOrder: 1 },
    ]);
    expect(calls).toHaveLength(2);
    const bySymbol = new Map(calls.map((c) => [new URL(c.url).searchParams.get("symbol"), c]));
    for (const c of calls) expect(c.method).toBe("PATCH");
    expect(JSON.parse(bySymbol.get("eq.ZZC")?.body ?? "")).toEqual({ sort_order: 0 });
    expect(JSON.parse(bySymbol.get("eq.ZZA")?.body ?? "")).toEqual({ sort_order: 1 });
  });

  it("setSortOrders with no updates makes no requests", async () => {
    const { store, calls } = setup(() => new Response(null, { status: 204 }));
    await store.setSortOrders([]);
    expect(calls).toHaveLength(0);
  });

  it("setSortOrders throws StoreError when any update fails", async () => {
    const { store } = setup((_req, i) => (i === 1 ? json({ message: "boom" }, 500) : new Response(null, { status: 204 })));
    await expect(
      store.setSortOrders([
        { symbol: "ZZA", sortOrder: 0 },
        { symbol: "ZZB", sortOrder: 1 },
      ]),
    ).rejects.toThrow(/setSortOrders failed: boom/);
  });

  it("a 500 on list or remove throws StoreError", async () => {
    const { store } = setup(() => json({ message: "boom" }, 500));
    await expect(store.list()).rejects.toBeInstanceOf(StoreError);
    await expect(store.remove("ZZA")).rejects.toBeInstanceOf(StoreError);
  });
});
