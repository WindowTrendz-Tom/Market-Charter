import { StoreError } from "@/lib/cache/candle-store";
import type { WatchlistRow, WatchlistStore } from "@/lib/watchlist/watchlist-store";

type WatchlistMethod = keyof WatchlistStore;

interface MemoryWatchlistRow extends WatchlistRow {
  /** Insertion order, standing in for created_at. */
  seq: number;
}

/** In-memory WatchlistStore for one user, with the same semantics as the Supabase one. Test-only. */
export class MemoryWatchlistStore implements WatchlistStore {
  private data: MemoryWatchlistRow[] = [];
  private nextSeq = 1;
  private failing = new Set<WatchlistMethod>();

  private enter(method: WatchlistMethod) {
    if (this.failing.delete(method)) throw new StoreError(`Memory watchlist ${method} failed (injected)`);
  }

  // test-only helpers
  failNext(method: WatchlistMethod) {
    this.failing.add(method);
  }

  /** Copies of the rows, in list order. */
  rows(): WatchlistRow[] {
    return this.ordered().map(({ symbol, sortOrder }) => ({ symbol, sortOrder }));
  }

  private ordered() {
    return [...this.data].sort((a, b) => a.sortOrder - b.sortOrder || a.seq - b.seq);
  }

  async list() {
    this.enter("list");
    return this.rows();
  }

  async insert(symbol: string, sortOrder: number) {
    this.enter("insert");
    if (this.data.some((r) => r.symbol === symbol)) return "duplicate" as const;
    this.data.push({ symbol, sortOrder, seq: this.nextSeq++ });
    return "ok" as const;
  }

  async remove(symbol: string) {
    this.enter("remove");
    const before = this.data.length;
    this.data = this.data.filter((r) => r.symbol !== symbol);
    return this.data.length < before;
  }

  async setSortOrders(updates: WatchlistRow[]) {
    this.enter("setSortOrders");
    for (const u of updates) {
      const row = this.data.find((r) => r.symbol === u.symbol);
      if (row) row.sortOrder = u.sortOrder;
    }
  }
}
