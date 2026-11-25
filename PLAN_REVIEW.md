VERDICT: CHANGES NEEDED

# Plan Review – Phase 2 (Watchlist), round 1

I reviewed `PLAN.md` (Phase 2, round 1) against `BUILD_LOOP.md`, the Phase 1 code, `PROGRESS.md` and the Phase 1 migration.

Context from the orchestrator: the Supabase project the plan was researched against (ref `iujtvcbstjbmpfonvfuv`) has been **deleted**. The replacement project is in Sydney, ref `oxepsjesqzpkmljajwti`. The Phase 1 migration will be re-applied to it as-is. The design is sound, and the code tasks (T1–T8) don't depend on the project. Both blocking points come from the project switch: the orchestrator steps and the live proof still assume the old project and its data.

## Summary of checks

| Check | Result |
|---|---|
| 1. Acceptance criteria covered | Pass. Login: T1, T2, O1–O3, T9 steps 2–4 and 13. Add/remove/reorder with symbol-search validation: T3, T4, T6, T7, T8, T9 steps 5, 6, 8 and 9. Sidebar last price and day % from cache: T5, T6, T8, T9 steps 7 and 10. The definition of done is covered per task. |
| 2. Hard constraints | Pass. The key stays on the server: provider code is server-only, there's no browser Supabase client and the T8 grep guard. The cache is checked first: `GET /api/watchlist` is cache-only and the refresh goes through `getChartCandles`. Every `symbol_search` call gets a `fetch_log` row through the lease and counts towards the shared budget guard. Rate limits show clear messages and pause the queue. `searchSymbols` sits on the same `DataProvider` interface in `lib/data-provider/`. Attribution is unchanged (root layout footer, which `/login` also uses). No chart API changes. Dates show in NZ time via `formatNzDate`. `.env.example` is updated with empty values. |
| 3. Order, size, testable "done when" | Pass for T1–T8 (dependencies run in order). T9 fails on the new project: see point 2. |
| 4. Scope, stack, schema | Pass. `@supabase/ssr` was already planned for Phase 2 in the Phase 1 plan. No paid services. **No schema change is needed beyond the Phase 1 migration.** `watchlist` already has `sort_order`, the `unique (user_id, symbol)` behind the 23505 → `duplicate` mapping, `user_id default auth.uid()`, the owner policy and `authenticated` grants. `fetch_log."interval"` is free text with no CHECK, and its `status` CHECK already allows `ok`, `not_found`, `rate_limited` and `error`. The pending-lease unique index on (`symbol`, `"interval"`) keeps `symbol_search` leases separate from `1day`. The auth config changes in O3 are project settings, not schema changes. |
| 5. Credit estimate | Fits the free plan once corrected (point 2): about 8 to 9 credits expected, 15 or fewer with retries, and no more than about 5 a minute, against 8/min and 800/day. |

## Required changes

1. **Orchestrator steps O1, O3 and O5, plus "Verified facts" / "Live project state": the deleted project ref is hard-coded, and no step sets up the new project.**
   - **Problem:**
     - O1 (`GET /v1/projects/iujtvcbstjbmpfonvfuv/api-keys`) and O3 (`PATCH /v1/projects/iujtvcbstjbmpfonvfuv/config/auth`) point at the deleted project. O5 and the O3 verify step (`…/config/auth`) inherit it.
     - The facts O1–O3 depend on were read from the deleted project:
       - the publishable key exists;
       - the auth config (`disable_signup: false`, `password_min_length: 6`, built-in SMTP);
       - ES256 signing keys;
       - the `watchlist_owner_all` policy;
       - the candle and `fetch_log` row counts.
     - No step re-applies the migration or updates `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`) for the new project. Yet T1's dev check, T9 step 1 (`RUN_SUPABASE_TESTS=1`) and T9 step 11 all need them.
   - **Required:**
     - Don't hard-code a project ref anywhere. Derive it from the env URL, e.g. `ref=$(node -p 'new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]')` after sourcing `.env.local`, and use `/v1/projects/$ref/...` in O1, O3, O5 and any Management API SQL check (O2's `auth.users` query, T9 SQL).
     - Add an **O0** before O1:
       - update `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local` for the new project, without echoing values;
       - apply `supabase/migrations/20261125000000_initial_schema.sql` unchanged;
       - verify all 4 tables have `relrowsecurity = true` and the `watchlist_owner_all` policy exists;
       - confirm the derived ref is the new project's.
     - In O1 and O3, re-read the auth config, signing-key type and publishable key type from the new project, rather than relying on the old project's values. Mark the "Live project state" section as being about the deleted project, or replace it.

2. **P2-T9 (steps 4–5, 10) and the "API credit estimate": they assume Phase 1's cached AAPL and MSFT data, which no longer exists.**
   - **Problem:**
     - The new project starts with empty `candles` and `fetch_log`.
     - Step 4 expects `/chart/AAPL` to render from `source` cache. Instead it will backfill (1 credit, `source: api`).
     - Step 5 expects MSFT (and AAPL) to show a price with **no** "Not loaded yet". Instead MSFT will be cold and filled by the queue (1 more credit).
     - The estimate table counts only NVDA as a backfill, and "Today's running total is 4" comes from the deleted project's `fetch_log`.
     - These "done when" checks would fail as written.
   - **Required:**
     - Rewrite the step 4 and 5 expectations for an empty cache:
       - AAPL is backfilled by the step 4 chart open, so it then has a price when added;
       - MSFT and NVDA appear as "Not loaded yet" and are filled by the paced queue;
       - the SQL in step 5 expects `1day ok` rows for whichever tickers were cold.
     - Update the step 10 baseline if needed.
     - Re-do the credit table: 3 searches + 1 ZZZZQX search + 3 backfills (AAPL, MSFT, NVDA) ≈ 7, plus 0–2 retries/incrementals. Keep the ≤ 15 cap and recompute the peak per minute.
     - Note that Twelve Data counts credits per API key. Credits already spent today (logged in the deleted project) are invisible to the budget guard, so the "today's total" baseline must come from the new `fetch_log` plus a note of any earlier spend.

## Optional (not blocking)

- **P2-T1:** If the new project only has the legacy HS256 key, `getClaims()` falls back to an Auth round trip per request. It still works, but record which applies after O1.
- **P2-T1:** Phase 1 checked that `process.env` is read only in `lib/env.ts`. After the move it will live in `lib/config-error.ts`. If anyone re-runs that grep, update the expected file.
- **P2-T8:** This is the largest task (client, queue, sidebar, CSS, chart-view hook). Consider splitting the sidebar component from `client.ts` / `refresh-queue.ts` if the first review round runs long.
- **Refresh queue:** A watchlist ticker that never becomes fresh (e.g. `forbidden` or `not_found` on refresh after being added) costs 1 credit per full page load. That's the same trade-off Phase 1 accepted for charts. Worth a line under Risks.
- **Decision 7 (E2E user):** It's a second auth user in a single-user app. That's fine as a test fixture, but Tom should know it exists. It's already disclosed.
