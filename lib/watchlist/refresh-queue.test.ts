import { describe, expect, it, vi } from "vitest";
import type { WatchlistItem } from "./api-types";
import type { RefreshOutcome } from "./client";
import { runRefreshQueue, type RefreshQueueDeps } from "./refresh-queue";

const it_ = (symbol: string): WatchlistItem => ({ symbol, quote: null });
const fetched = (s: string): RefreshOutcome => ({ kind: "fetched", item: it_(s) });
const cached = (s: string): RefreshOutcome => ({ kind: "cached", item: it_(s) });

function setup(script: (symbol: string, call: number) => RefreshOutcome, opts: { cancelAt?: number } = {}) {
  const calls: string[] = [];
  const counts = new Map<string, number>();
  const sleeps: number[] = [];
  const items: string[] = [];
  const progress: Array<[number, number]> = [];
  const deps: RefreshQueueDeps = {
    refresh: vi.fn(async (symbol: string) => {
      calls.push(symbol);
      const n = (counts.get(symbol) ?? 0) + 1;
      counts.set(symbol, n);
      return script(symbol, n);
    }),
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
    }),
    isCancelled: () => opts.cancelAt !== undefined && calls.length >= opts.cancelAt,
    onItem: (item) => items.push(item.symbol),
    onProgress: (done, total) => progress.push([done, total]),
  };
  return { deps, calls, sleeps, items, progress };
}

describe("runRefreshQueue", () => {
  it("paces fetched items and skips the pause after the last", async () => {
    const t = setup((s) => fetched(s));
    const end = await runRefreshQueue(["A", "B", "C"], t.deps);
    expect(end).toEqual({ status: "done", message: null });
    expect(t.sleeps).toEqual([10000, 10000]);
    expect(t.items).toEqual(["A", "B", "C"]);
    expect(t.progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it("does not sleep for cached items", async () => {
    const t = setup((s) => cached(s));
    await runRefreshQueue(["A", "B", "C"], t.deps);
    expect(t.sleeps).toEqual([]);
    expect(t.items).toEqual(["A", "B", "C"]);
  });

  it("retries busy then succeeds", async () => {
    const t = setup((s, n) => (n <= 2 ? { kind: "busy" } : fetched(s)));
    const end = await runRefreshQueue(["A"], t.deps);
    expect(end.status).toBe("done");
    expect(t.sleeps).toEqual([3000, 3000]);
    expect(t.calls).toEqual(["A", "A", "A"]);
    expect(t.items).toEqual(["A"]);
  });

  it("skips a symbol that stays busy after 3 retries", async () => {
    const t = setup((s) => (s === "A" ? { kind: "busy" } : cached(s)));
    const end = await runRefreshQueue(["A", "B"], t.deps);
    expect(end.status).toBe("done");
    expect(t.calls).toEqual(["A", "A", "A", "A", "B"]);
    expect(t.sleeps).toEqual([3000, 3000, 3000]);
    expect(t.items).toEqual(["B"]);
    expect(t.progress).toEqual([[1, 2], [2, 2]]);
  });

  it("skips a failed symbol and still paces", async () => {
    const t = setup((s) => (s === "A" ? { kind: "failed", message: "x" } : cached(s)));
    const end = await runRefreshQueue(["A", "B"], t.deps);
    expect(end.status).toBe("done");
    expect(t.sleeps).toEqual([10000]);
    expect(t.items).toEqual(["B"]);
  });

  it("stops on limited, emitting its item, and never refreshes the 3rd", async () => {
    const t = setup((s) =>
      s === "B" ? { kind: "limited", message: "Paused", item: it_("B") } : fetched(s),
    );
    const end = await runRefreshQueue(["A", "B", "C"], t.deps);
    expect(end).toEqual({ status: "limited", message: "Paused" });
    expect(t.calls).toEqual(["A", "B"]);
    expect(t.items).toEqual(["A", "B"]);
  });

  it("stops on limited with no item", async () => {
    const t = setup(() => ({ kind: "limited", message: "Paused", item: null }));
    const end = await runRefreshQueue(["A", "B"], t.deps);
    expect(end).toEqual({ status: "limited", message: "Paused" });
    expect(t.items).toEqual([]);
  });

  it("stops on unauthorized", async () => {
    const t = setup((s) => (s === "A" ? fetched(s) : { kind: "unauthorized" }));
    const end = await runRefreshQueue(["A", "B", "C"], t.deps);
    expect(end).toEqual({ status: "unauthorized", message: null });
    expect(t.calls).toEqual(["A", "B"]);
  });

  it("processes a symbol appended during the first refresh", async () => {
    const queue = ["A"];
    const t = setup((s) => {
      if (s === "A") queue.push("Z");
      return fetched(s);
    });
    const end = await runRefreshQueue(queue, t.deps);
    expect(end.status).toBe("done");
    expect(t.calls).toEqual(["A", "Z"]);
    expect(t.sleeps).toEqual([10000]);
    expect(t.progress).toEqual([[1, 2], [2, 2]]);
  });

  it("stops when cancelled before the 2nd", async () => {
    const t = setup((s) => cached(s), { cancelAt: 1 });
    const end = await runRefreshQueue(["A", "B", "C"], t.deps);
    expect(end).toEqual({ status: "cancelled", message: null });
    expect(t.calls).toEqual(["A"]);
  });

  it("returns done for an empty queue", async () => {
    const t = setup((s) => cached(s));
    expect(await runRefreshQueue([], t.deps)).toEqual({ status: "done", message: null });
  });
});
