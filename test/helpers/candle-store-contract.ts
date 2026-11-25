import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEASE_TTL_MS, type CandleStore } from "@/lib/cache/candle-store";
import type { Candle } from "@/lib/data-provider/types";

// Fake clock far in the future so sumCreditsSince only ever sees this suite's own rows,
// even against a database that holds real fetch_log history.
const BASE = new Date("2100-01-01T00:00:00.000Z");
const at = (offsetMs: number) => new Date(BASE.getTime() + offsetMs);

const bar = (day: number, close: number, volume: number | null = 1000): Candle => ({
  ts: `2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume,
});

export function runCandleStoreContract(
  name: string,
  makeStore: () => Promise<{ store: CandleStore; cleanup(): Promise<void> }>,
  symbolPrefix: string,
) {
  describe(`CandleStore contract: ${name}`, () => {
    let store: CandleStore;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
      ({ store, cleanup } = await makeStore());
    });
    afterAll(async () => {
      await cleanup();
    });

    it("round-trips candles ascending, with null volume and numeric types", async () => {
      const symbol = `${symbolPrefix}RT`;
      await store.upsertCandles(symbol, "1day", [bar(20, 12.5, null), bar(18, 10.25), bar(19, 11)]);
      const got = await store.getCandles(symbol, "1day");
      expect(got.map((c) => c.ts)).toEqual([
        "2026-11-18T00:00:00.000Z",
        "2026-11-19T00:00:00.000Z",
        "2026-11-20T00:00:00.000Z",
      ]);
      expect(got[0]).toEqual(bar(18, 10.25));
      expect(got[2].volume).toBeNull();
      expect(typeof got[0].close).toBe("number");
    });

    it("returns empty / null for an unknown series", async () => {
      const symbol = `${symbolPrefix}NONE`;
      expect(await store.getCandles(symbol, "1day")).toEqual([]);
      expect(await store.getLatestCandleTs(symbol, "1day")).toBeNull();
      expect(await store.getLastOkFetchAt(symbol, "1day")).toBeNull();
    });

    it("upserting the same ts overwrites it", async () => {
      const symbol = `${symbolPrefix}OW`;
      await store.upsertCandles(symbol, "1day", [bar(18, 10), bar(19, 11)]);
      await store.upsertCandles(symbol, "1day", [bar(19, 99), bar(20, 12)]);
      const got = await store.getCandles(symbol, "1day");
      expect(got).toHaveLength(3);
      expect(got.find((c) => c.ts.startsWith("2026-11-19"))?.close).toBe(99);
    });

    it("upserting an empty array is a no-op", async () => {
      await expect(store.upsertCandles(`${symbolPrefix}EMPTY`, "1day", [])).resolves.toBeUndefined();
    });

    it("reports the latest candle ts", async () => {
      const symbol = `${symbolPrefix}LT`;
      await store.upsertCandles(symbol, "1day", [bar(19, 11), bar(24, 14), bar(20, 12)]);
      expect(await store.getLatestCandleTs(symbol, "1day")).toBe("2026-11-24T00:00:00.000Z");
    });

    it("lease: acquire, second acquire null, complete, acquire again", async () => {
      const symbol = `${symbolPrefix}LEASE`;
      const id = await store.acquireFetchLease(symbol, "1day", at(0));
      expect(id).toEqual(expect.any(Number));
      expect(await store.acquireFetchLease(symbol, "1day", at(1000))).toBeNull();
      await store.completeFetchLease(
        id as number,
        { status: "ok", creditsUsed: 1, candlesReceived: 3, message: null },
        at(2000),
      );
      expect(await store.acquireFetchLease(symbol, "1day", at(3000))).toEqual(expect.any(Number));
    });

    it("lease: a stale pending row is expired by the next acquire", async () => {
      const symbol = `${symbolPrefix}STALE`;
      const stale = await store.acquireFetchLease(symbol, "1day", at(-(LEASE_TTL_MS + 1000)));
      expect(stale).toEqual(expect.any(Number));
      const fresh = await store.acquireFetchLease(symbol, "1day", at(0));
      expect(fresh).toEqual(expect.any(Number));
      expect(fresh).not.toBe(stale);
      expect(await store.acquireFetchLease(symbol, "1day", at(1000))).toBeNull();
    });

    it("lease: independent series do not block each other", async () => {
      expect(await store.acquireFetchLease(`${symbolPrefix}IND1`, "1day", at(0))).toEqual(expect.any(Number));
      expect(await store.acquireFetchLease(`${symbolPrefix}IND2`, "1day", at(0))).toEqual(expect.any(Number));
    });

    it("getLastOkFetchAt only counts ok rows", async () => {
      const symbol = `${symbolPrefix}OK`;
      const failed = await store.acquireFetchLease(symbol, "1day", at(0));
      await store.completeFetchLease(
        failed as number,
        { status: "error", creditsUsed: 1, candlesReceived: null, message: "boom" },
        at(100),
      );
      expect(await store.getLastOkFetchAt(symbol, "1day")).toBeNull();

      const good = await store.acquireFetchLease(symbol, "1day", at(5000));
      await store.completeFetchLease(
        good as number,
        { status: "ok", creditsUsed: 1, candlesReceived: 2, message: null },
        at(5100),
      );
      const pending = await store.acquireFetchLease(symbol, "1day", at(9000));
      expect(pending).toEqual(expect.any(Number));
      expect((await store.getLastOkFetchAt(symbol, "1day"))?.toISOString()).toBe(at(5000).toISOString());
    });

    it("sumCreditsSince includes rows at the boundary and excludes earlier ones", async () => {
      const symbol = `${symbolPrefix}SUM`;
      const since = at(10 * 86_400_000);
      const before = await store.acquireFetchLease(symbol, "1day", new Date(since.getTime() - 1));
      await store.completeFetchLease(
        before as number,
        { status: "ok", creditsUsed: 5, candlesReceived: 1, message: null },
        since,
      );
      const exact = await store.acquireFetchLease(symbol, "1day", since);
      await store.completeFetchLease(
        exact as number,
        { status: "ok", creditsUsed: 2, candlesReceived: 1, message: null },
        since,
      );
      const after = await store.acquireFetchLease(symbol, "1day", new Date(since.getTime() + 1));
      await store.completeFetchLease(
        after as number,
        { status: "rate_limited", creditsUsed: 0, candlesReceived: null, message: "limit" },
        since,
      );
      expect(await store.sumCreditsSince(since)).toBe(2);
      expect(await store.sumCreditsSince(new Date(since.getTime() - 1))).toBe(7);
      expect(await store.sumCreditsSince(new Date(since.getTime() + 2))).toBe(0);
    });
  });
}
