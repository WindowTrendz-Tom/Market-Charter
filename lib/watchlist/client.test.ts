import { describe, expect, it, vi } from "vitest";
import type { ErrorCode } from "@/lib/candles/api-types";
import type { WatchlistItem, WatchlistRefreshResponse } from "./api-types";
import { createWatchlistClient, toRefreshOutcome, type ApiResult } from "./client";

const item: WatchlistItem = { symbol: "AAPL", quote: null };

function setup(...responses: Array<Response | Error>) {
  const fetchFn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fetchFn.mockRejectedValueOnce(r);
    else fetchFn.mockResolvedValueOnce(r);
  }
  const sleep = vi.fn().mockResolvedValue(undefined);
  const client = createWatchlistClient({ fetch: fetchFn as unknown as typeof fetch, sleep });
  return { client, fetchFn, sleep };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("watchlist client requests", () => {
  it("list GETs /api/watchlist", async () => {
    const { client, fetchFn } = setup(json({ items: [item] }));
    const r = await client.list();
    expect(r).toEqual({ ok: true, data: { items: [item] } });
    expect(fetchFn).toHaveBeenCalledWith("/api/watchlist", undefined);
  });

  it("add POSTs the symbol as JSON", async () => {
    const { client, fetchFn } = setup(json({ item }, 201));
    const r = await client.add("AAPL");
    expect(r).toEqual({ ok: true, data: { item } });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/watchlist");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ symbol: "AAPL" });
  });

  it("remove DELETEs with an encoded query and maps 204 to null data", async () => {
    const { client, fetchFn } = setup(new Response(null, { status: 204 }));
    const r = await client.remove("BRK.B");
    expect(r).toEqual({ ok: true, data: null });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/watchlist?symbol=BRK.B");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("remove encodes unsafe characters", async () => {
    const { client, fetchFn } = setup(new Response(null, { status: 204 }));
    await client.remove("A&B");
    expect(fetchFn.mock.calls[0][0]).toBe("/api/watchlist?symbol=A%26B");
  });

  it("saveOrder PATCHes the symbols", async () => {
    const { client, fetchFn } = setup(json({ items: [item] }));
    await client.saveOrder(["B", "A"]);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/watchlist");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ symbols: ["B", "A"] });
  });

  it("refresh POSTs to /api/watchlist/refresh", async () => {
    const { client, fetchFn } = setup(json({ item, source: "cache", notice: null }));
    const r = await client.refresh("AAPL");
    expect(r.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/watchlist/refresh");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ symbol: "AAPL" });
  });
});

describe("watchlist client error mapping", () => {
  it("maps a network throw", async () => {
    const { client } = setup(new Error("net"));
    expect(await client.list()).toEqual({
      ok: false,
      status: 0,
      code: null,
      message: "Couldn't reach the server.",
    });
  });

  it("retries a 401 once, then maps a final 401 to unauthorized", async () => {
    const { client, fetchFn, sleep } = setup(new Response(null, { status: 401 }), new Response(null, { status: 401 }));
    expect(await client.list()).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
      message: "Your session has expired. Log in again.",
    });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("recovers when the 401 retry succeeds", async () => {
    const { client } = setup(new Response(null, { status: 401 }), json({ items: [] }));
    expect(await client.list()).toEqual({ ok: true, data: { items: [] } });
  });

  it("uses the body's error code and message", async () => {
    const { client } = setup(json({ error: { code: "duplicate", message: "AAPL is already on your watchlist." } }, 409));
    expect(await client.add("AAPL")).toEqual({
      ok: false,
      status: 409,
      code: "duplicate",
      message: "AAPL is already on your watchlist.",
    });
  });

  it("falls back to a generic message for an unparsable error body", async () => {
    const { client } = setup(new Response("<html>", { status: 500 }));
    expect(await client.list()).toEqual({
      ok: false,
      status: 500,
      code: null,
      message: "Something went wrong. Try again.",
    });
  });

  it("falls back to a generic message when the error body has no message", async () => {
    const { client } = setup(json({ error: {} }, 500));
    const r = await client.list();
    expect(r).toMatchObject({ ok: false, status: 500, code: null, message: "Something went wrong. Try again." });
  });

  it("reports an unparsable OK body as unexpected", async () => {
    const { client } = setup(new Response("nope", { status: 200 }));
    expect(await client.list()).toEqual({
      ok: false,
      status: 0,
      code: null,
      message: "Unexpected response from the server.",
    });
  });
});

describe("toRefreshOutcome", () => {
  const ok = (over: Partial<WatchlistRefreshResponse>): ApiResult<WatchlistRefreshResponse> => ({
    ok: true,
    data: { item, source: "cache", notice: null, ...over },
  });
  const fail = (
    status: number,
    code: ErrorCode | null,
    message = "msg",
  ): ApiResult<WatchlistRefreshResponse> => ({
    ok: false,
    status,
    code,
    message,
  });

  it("rate_limited notice -> limited with item", () => {
    expect(toRefreshOutcome(ok({ notice: { code: "rate_limited", message: "slow down" } }))).toEqual({
      kind: "limited",
      message: "slow down",
      item,
    });
  });
  it("busy notice -> busy", () => {
    expect(toRefreshOutcome(ok({ notice: { code: "busy", message: "b" } }))).toEqual({ kind: "busy" });
  });
  it("source api -> fetched", () => {
    expect(toRefreshOutcome(ok({ source: "api" }))).toEqual({ kind: "fetched", item });
  });
  it("other notice -> failed with the notice message", () => {
    expect(toRefreshOutcome(ok({ notice: { code: "provider_unavailable", message: "down" } }))).toEqual({
      kind: "failed",
      message: "down",
    });
  });
  it("no notice from cache -> cached", () => {
    expect(toRefreshOutcome(ok({}))).toEqual({ kind: "cached", item });
  });
  it("rate_limited notice wins over source api", () => {
    const r = toRefreshOutcome(ok({ source: "api", notice: { code: "rate_limited", message: "x" } }));
    expect(r.kind).toBe("limited");
  });
  it("429 -> limited with no item", () => {
    expect(toRefreshOutcome(fail(429, "rate_limited", "wait"))).toEqual({ kind: "limited", message: "wait", item: null });
  });
  it("503 busy -> busy", () => {
    expect(toRefreshOutcome(fail(503, "busy"))).toEqual({ kind: "busy" });
  });
  it("401 -> unauthorized", () => {
    expect(toRefreshOutcome(fail(401, "unauthorized"))).toEqual({ kind: "unauthorized" });
  });
  it("anything else -> failed", () => {
    expect(toRefreshOutcome(fail(404, "not_in_watchlist", "gone"))).toEqual({ kind: "failed", message: "gone" });
    expect(toRefreshOutcome(fail(503, "provider_unavailable", "down"))).toEqual({ kind: "failed", message: "down" });
    expect(toRefreshOutcome(fail(0, null, "Couldn't reach the server."))).toEqual({
      kind: "failed",
      message: "Couldn't reach the server.",
    });
  });
});
