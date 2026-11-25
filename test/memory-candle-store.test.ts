import { describe, expect, it } from "vitest";
import { StoreError } from "@/lib/cache/candle-store";
import { MemoryCandleStore } from "./helpers/memory-candle-store";
import { runCandleStoreContract } from "./helpers/candle-store-contract";

runCandleStoreContract(
  "MemoryCandleStore",
  async () => ({ store: new MemoryCandleStore(), cleanup: async () => {} }),
  "ZZTEST",
);

describe("MemoryCandleStore helpers", () => {
  it("failNext makes only the next call throw StoreError", async () => {
    const store = new MemoryCandleStore();
    store.failNext("getCandles");
    await expect(store.getCandles("ZZTESTF", "1day")).rejects.toBeInstanceOf(StoreError);
    await expect(store.getCandles("ZZTESTF", "1day")).resolves.toEqual([]);
  });

  it("logRows returns copies and seedLog adds rows", async () => {
    const store = new MemoryCandleStore();
    store.seedLog({ symbol: "ZZTESTL", interval: "1day", status: "ok", createdAt: new Date(0), creditsUsed: 1 });
    const rows = store.logRows();
    rows[0].status = "error";
    expect(store.logRows()[0].status).toBe("ok");
  });
});
