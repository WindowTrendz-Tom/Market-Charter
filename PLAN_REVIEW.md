VERDICT: APPROVED

# Plan Review – Phase 2 (Watchlist), round 2

I re-reviewed all of `PLAN.md` (Phase 2, round 2) against `BUILD_LOOP.md`, the Phase 1 code, `PROGRESS.md` and the Phase 1 migration. I also checked whether the round 1 fixes caused new problems. Per the orchestrator, most of O0 is already done on the new project: migration applied, RLS true on all 4 tables, `.env.local` updated and the new host allowed. I didn't block on O0.

## Round 1 points

| Point | Status |
|---|---|
| 1. Hard-coded deleted ref; no new-project setup | Fixed. `$ref` is derived from `NEXT_PUBLIC_SUPABASE_URL` with a format check. O0 covers the host, URL, keys (values never printed), the migration applied unchanged, RLS, policies, grants, row counts, live key checks, and a re-read of the auth config and signing keys. O1 is folded into O0, and the old project's facts are marked as historical. |
| 2. T9 and credit estimate assumed cached AAPL/MSFT | Fixed. Steps 4, 5, 10 and 14 now expect an empty cache (AAPL backfilled in step 4, MSFT and NVDA filled by the queue). The `fetch_log` sequence in step 5 and the count of 7 in step 10 are consistent. The credit table is 4 searches + 3 backfills = 7. A separate "earlier spend today" line covers credits counted against the key but not in the new `fetch_log`. |

## Summary of checks

| Check | Result |
|---|---|
| 1. Acceptance criteria covered | Pass. Login: T1, T2, O0, O2, O3, T9 steps 2–4 and 13. Add, remove and reorder with symbol-search validation: T3, T4, T6, T7, T8, T9 steps 5, 6, 8 and 9. Sidebar last price and day % change from cache: T5, T6, T8, T9 steps 5, 7 and 10. |
| 2. Hard constraints | Pass, unchanged from round 1. The key stays on the server, and the browser has no Supabase client. The cache is read first: the list is cache-only and refresh goes through `getChartCandles`. Searches are logged in `fetch_log` and count towards the shared budget guard. `searchSymbols` uses the provider interface. Attribution is unchanged, and the chart API is unchanged. Dates are stored in UTC and shown in NZ time. There are no secrets in the plan, and `.env.example` is updated. |
| 3. Order, size, testable "done when" | Pass. O0 runs before T1, and O2/O3 run before T9. The T1 `process.env` grep is correct against the current tree: the only other hits are `*.test.ts` files, which the check excludes. The "27 tests" count for `get-chart-candles` matches the file (23 `it` plus the `it.each` expansions). The T8a/T8b split option is reasonable. |
| 4. Scope, stack, schema | Pass. The migration is re-applied unchanged (verified by `git diff --exit-code` and a sha256). There is no schema change. The auth settings in O3 are project config. `@supabase/ssr` was already planned. |
| 5. Credit estimate | Pass. 7 credits expected, 7–9 with retries, capped at 15. That is far below 800/day and below 8/min even with no pacing. |

## Required changes

None.

## Optional (not blocking)

- **Credit estimate "Peak per minute" and T9 step 14:** The timeline gives up to **5** credits in one 60 s window, not 4. For example, 20 s to 79 s holds the AAPL search, the MSFT search and backfill, and the NVDA search and backfill. This is still well under 8/min. Change "at most 4" and step 14's "expected ≤ 4" to **≤ 5**, so the Executor doesn't log a false mismatch.
- **Header note vs O0:** The plan says "No project ref is hard-coded in this plan", but O0 sub-steps 1–2 contain the new host. That is unavoidable, because it's the source value. Reword the note to "no ref is hard-coded outside O0's one-off URL setup" for accuracy. O0 is mostly done, so this is tidy-up only.
- **T9 "Before starting":** Take the credit baseline after step 1. The integration contract writes and then deletes `ZZTEST%` rows, so the result is the same either way, but it's clearer to take the baseline after that run.
- **T9 timing:** 18:00 New York is 23:00 UTC and 12:00 NZDT only while the US is on EST, which is correct for this run. If T9 slips into a different DST period, recompute it.
