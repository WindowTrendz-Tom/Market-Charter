import type { WatchlistItem } from "./api-types";
import type { RefreshOutcome } from "./client";
import { MAX_REFRESH_BUSY_RETRIES, REFRESH_BUSY_RETRY_MS, REFRESH_PACE_MS } from "./limits";

export interface RefreshQueueDeps {
  refresh(symbol: string): Promise<RefreshOutcome>;
  sleep(ms: number): Promise<void>;
  isCancelled(): boolean;
  onItem(item: WatchlistItem): void;
  onProgress(done: number, total: number): void;
}

export type QueueEnd =
  | { status: "done" | "cancelled" | "unauthorized"; message: null }
  | { status: "limited"; message: string };

/** Refreshes symbols one at a time, pacing credit-spending calls. `queue` may grow while this runs. */
export async function runRefreshQueue(queue: string[], deps: RefreshQueueDeps): Promise<QueueEnd> {
  for (let i = 0; i < queue.length; i++) {
    if (deps.isCancelled()) return { status: "cancelled", message: null };
    const symbol = queue[i];
    let outcome = await deps.refresh(symbol);
    for (let retries = 0; outcome.kind === "busy" && retries < MAX_REFRESH_BUSY_RETRIES; retries++) {
      await deps.sleep(REFRESH_BUSY_RETRY_MS);
      if (deps.isCancelled()) return { status: "cancelled", message: null };
      outcome = await deps.refresh(symbol);
    }
    switch (outcome.kind) {
      case "limited":
        if (outcome.item) deps.onItem(outcome.item);
        return { status: "limited", message: outcome.message };
      case "unauthorized":
        return { status: "unauthorized", message: null };
      case "fetched":
        deps.onItem(outcome.item);
        if (i < queue.length - 1) await deps.sleep(REFRESH_PACE_MS);
        break;
      case "cached":
        deps.onItem(outcome.item);
        break;
      case "failed":
        if (i < queue.length - 1) await deps.sleep(REFRESH_PACE_MS);
        break;
      case "busy":
        break;
    }
    deps.onProgress(i + 1, queue.length);
  }
  return { status: "done", message: null };
}
