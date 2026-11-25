VERDICT: APPROVED

# Code review – P2-T8a (round 1)

Scope: steps 1–3 of P2-T8 (`lib/watchlist/events.ts`, `client.ts`, `refresh-queue.ts` + tests). Sidebar/layout/CSS are P2-T8b (allowed split).

(Written by the orchestrator from the code reviewer's returned report; the reviewer did not write this file itself.)

## Checks
- `npm run build`, `npm run lint`, `npm test` (31 files, 316 passed, 11 skipped), `tsc` – all pass.
- Credential grep (twelvedata, SUPABASE_SECRET, TWELVE_DATA) on client/queue code – nothing. No `server-only` imports, no stray `any`.
- Pacing: waits `REFRESH_PACE_MS` (10 s) after `fetched`/`failed`, skips after last item → ≤ 6 credits/min per queue.
- Rate limit: `limited` emits its item (if any) and returns `limited` with message; no auto-retry; caller offers Retry.
- Cancel: `isCancelled()` before each item and after each busy sleep.
- Retries: busy retries capped at 3, then skip. No unbounded loops.
- Client: 401 → `unauthorized`; 409 passes body code/message; 429 → `limited`; network throw / empty body / unparsable OK body → error result, no crash.
- Plan queue test cases covered, plus extras.
- Executor's 4 concerns accepted (no pause after last `failed` item; cancel check after busy sleep; exported `WatchlistClient` type; notes).

## Optional
- `limited` returns without calling `onProgress` (matches plan) – T8b must not rely on a progress event for that item.
