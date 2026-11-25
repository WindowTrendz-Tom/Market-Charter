/** Bounds the per-row cache reads in the list and the sidebar refresh cost (at most 30 credits a day). */
export const MAX_WATCHLIST_ITEMS = 30;
/** Pause after a sidebar refresh that spent a credit: at most 6 credits a minute from the queue. */
export const REFRESH_PACE_MS = 10_000;
/** Busy handling for the sidebar refresh queue (matches Phase 1's chart busy retry). */
export const REFRESH_BUSY_RETRY_MS = 3_000;
export const MAX_REFRESH_BUSY_RETRIES = 3;
