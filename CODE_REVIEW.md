VERDICT: APPROVED

# Code review: P2-T8b (P2-T8 steps 4–7: sidebar, layout, chart-view hook, CSS), round 1

## Checks run by the reviewer
- `npm run lint` clean. `npx tsc --noEmit` clean (exit 0).
- `npm test`: 31 files passed, 1 skipped; 316 tests passed, 11 skipped.
- `npm run build` passes. Routes: `ƒ /`, `ƒ /api/candles/[symbol]`, `ƒ /api/watchlist`, `ƒ /api/watchlist/refresh`, `ƒ /chart/[symbol]`, `ƒ /login`, plus the Proxy.
- `grep -rn "twelvedata\|SUPABASE_SECRET\|TWELVE_DATA" components lib/watchlist/client.ts lib/watchlist/refresh-queue.ts` gives no output.
- **Render check, logged in (0 Twelve Data credits).** Ran `next start -p 3200` with `.env.local` and Playwright (Chromium, 1280x800, deviceScaleFactor 2). Logged in as the E2E user at `/login`, which redirected to `/`. Loaded `/` only.
  - Guard: Playwright aborted any `/api/watchlist/refresh` or `/api/candles` request. **None were attempted.** The only API call was `GET /api/watchlist 200`.
  - The sidebar showed the "Watchlist" heading (one `h2`), the "Add ticker" label tied to `#watchlist-symbol` (maxlength 10), the "Add" button, "Last close (USD) · day change" and "No tickers yet. Add one above, e.g. AAPL." The list had 0 `li`.
  - Console errors, warnings and page errors: none.
  - Screenshot: `docs/evidence/p2-t8b-sidebar-empty.png`. The server has been stopped.

## Against the plan (steps 4–7)
- **Step 4, sidebar.** The state shape matches. Mount lists first and sets state only after the await, then queues the null or stale quotes. There is a single queue (`queueRef` + `runningRef`). Appends go into the same array that `runRefreshQueue` iterates, so the queue picks them up. At the end: `limited` sets `paused` and `unauthorized` shows a login message. Unmount sets the cancel flag.
  - Add form, rows, `aria-current`, aria-labels, disabled first/last arrows, optimistic reorder (ok, 409 reload, revert) and optimistic remove with restore are all as specified.
  - Also as specified: the status line with Retry, the header row, the empty state, and the `CANDLES_UPDATED_EVENT` listener (merges quotes only and is removed on unmount).
- **Step 5, layout.** `<aside className="sidebar" aria-label="Watchlist">` is kept and contains `<WatchlistSidebar />`.
- **Step 6, chart-view.** Dispatches only after `setState`, and only for `ready` with `source === "api"`. The cancelled path returns early.
- **Step 7, CSS.** The rules match the plan exactly.

## Constraints
- The browser talks only to our own `/api/watchlist*` routes. No provider host, key or secret appears in client code.
- The sidebar spends no credits on an empty or fresh list. Refreshes go through the server route, which keeps the cache-first, budget-guard and `fetch_log` path.
- Timestamps are shown with `formatNzDate` (Pacific/Auckland). The attribution footer is still present (see screenshot).
- No `any` and no secrets in the diff.

## Robustness
- Network failure and unparsable responses are mapped by the client (T8a) to a message, not a throw.
- A 401 shows a login link that carries `next` (handled by `safeNextPath`).
- 429 / limited shows "Paused: …" with Retry.
- A list load failure shows `role="alert"`.
- An empty list shows the empty state (verified live).

## Executor's extras (from PROGRESS.md): all accepted
- **Move/remove disabled while a save is in flight.** Sensible. It prevents overlapping optimistic snapshots.
- **A new queue run resets `queueRef`.** Correct, and needed so that a later run can re-queue a symbol that went stale again. Appends during a run still land in the live array.
- **`limited` doesn't rely on `onProgress`.** Correct. The paused line is driven by the `QueueEnd`.
- **`<h2>Watchlist</h2>` moved into the component.** Harmless. The rendered output has exactly one heading in the aside.

## Optional (not blocking)
1. `components/watchlist-sidebar.tsx:141/158` and `:166/171`: on a failed reorder or remove, the revert restores the pre-click snapshot `previous`. Any quote the queue merged during the await is lost until the next load or event. A functional revert, which puts the old order back but keeps the latest quotes, would avoid this.
2. `components/watchlist-sidebar.tsx:164-175`: removing a symbol that is still in a running queue leaves it queued. The server returns 404 `not_in_watchlist` with no credit spent, but the queue treats this as `failed` and sleeps 10 s. This could be avoided by dropping the symbol from `queueRef` on a successful remove.
3. `components/watchlist-sidebar.tsx:134`: the "X added." status message is never cleared. It stays until another message replaces it.
4. `components/watchlist-sidebar.tsx:202`: `className="watchlist-add"` has no CSS rule. Either add a rule or drop the class.
5. `app/globals.css`, `.watchlist li` grid: with the plan's `1fr auto` grid, the change % falls into column 1 under the symbol, and the date into column 2. This follows the plan, but check it visually in T9 once rows exist.
