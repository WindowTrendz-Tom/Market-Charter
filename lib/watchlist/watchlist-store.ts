export interface WatchlistRow {
  symbol: string;
  sortOrder: number;
}

/** The current user's watchlist. Errors throw StoreError (from `@/lib/cache/candle-store`). */
export interface WatchlistStore {
  /** Current user's rows, ordered by sort_order then created_at. */
  list(): Promise<WatchlistRow[]>;
  insert(symbol: string, sortOrder: number): Promise<"ok" | "duplicate">;
  /** false when no row was deleted. */
  remove(symbol: string): Promise<boolean>;
  setSortOrders(updates: WatchlistRow[]): Promise<void>;
}
