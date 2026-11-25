import type { CandleStore, FetchCompletion } from "./candle-store";

/** A lease row left 'pending' expires after LEASE_TTL_MS, so a failed completion must not hide the provider result. */
export async function completeLeaseBestEffort(store: CandleStore, id: number, completion: FetchCompletion, now: Date) {
  try {
    await store.completeFetchLease(id, completion, now);
  } catch (err) {
    console.error(`Could not complete fetch_log lease ${id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
