VERDICT: CHANGES NEEDED

# Plan Review – Phase 1, round 1

Reviewed `PLAN.md` (round 1) against `BUILD_LOOP.md` and the repo. The repo has only `BUILD_LOOP.md`, `.gitignore`, `.claude/agents/` and `PLAN.md`. No app is scaffolded yet.

## Summary of checks

| Check | Result |
|---|---|
| 1. Acceptance criteria covered | Pass. Chart page: T7, T8, T9. Cache-first fetch and store: T3, T5, T6, T9. Second load uses zero calls: T6 case 2, T9 step 6. Footer attribution: T8. The definition of done (build/lint/test, PROGRESS.md, `.env.example`) is covered by T1 and the per-task checks. |
| 2. Hard constraints | Pass, with one correctness risk (item 1). The key is server-only: `server-only` imports, lazy env reads, the header auth and the T8 leak check. The cache is checked first and the provider is never called on store failure. Every call reaches `fetch_log` through the lease row. Rate-limit messages are clear. The provider interface matches the brief. Attribution, the v5 API (with grep checks), UTC storage / NZ display and the no-secrets rules are all covered. No indicator endpoints are used. |
| 3. Order, size, testable "done when" | Pass. Dependencies run in order (T2 env → T4 provider, T3 calendar → T4/T6, T5 store → T6 → T7 → T8). Each task has commands or tests that can be checked. T5 and T6 are large but still fit in one sitting. |
| 4. Scope, stack, schema | Pass. Creating all four tables from the brief's data model now is reasonable, the extra columns count as allowed refinements, and the plan flags this as a decision. `vitest` and `server-only` are tooling, not stack changes. `technicalindicators` and `@supabase/ssr` are deferred. |
| 5. Credit estimate | Pass. About 4 credits expected, 15 or fewer with retries, and no more than 3 in any minute. That's well within 8/min and 800/day. |
| Live-key split (T1–T8 offline, T9 live) | Sound. T1–T8 can be built and proved with fakes, the in-memory store and the local PG16 run. Each acceptance box is ticked only with T9's live proof. Open question 1 correctly hands the keys and network decision to Tom, and T9 can't pass its gate until he answers. |

## Required changes

1. **P1-T4: initial backfill relies on unverified `order=asc` + `outputsize=5000` behaviour.**
   - **Problem:** The request sends `order=asc` with `outputsize=5000` and no date. Nothing in "Verified facts" says whether Twelve Data then returns the *latest* 5,000 bars sorted ascending or the *oldest* 5,000. AAPL has more than 5,000 daily bars. If it returns the oldest, the first load caches roughly 1980–2000. The chart then shows decades-old data, failing acceptance #1. The stale logic would also need several credit-spending loads to catch up from a 20-year-old `start_date`. The fake-fetch tests can't catch this, and it would only show up in T9 step 6 after the code is approved.
   - **Required:** Drop `order=asc` from the request and use Twelve Data's default (`desc`, newest first). Step (d) already sorts ascending and de-dupes locally, so nothing else changes. Add a T4 test assertion that the URL has no `order` parameter (or `order=desc`). Keep the T9 step 6 check that `max(ts)` equals the expected latest trading date. Alternatively, list the asc/outputsize behaviour as an explicit unverified assumption with a fallback. Dropping the parameter is simpler and costs nothing.

## Optional (not blocking)

- **P1-T2 / P1-T5:** T2's done-when check is `grep -rn "process.env" lib app | grep -v "lib/env.ts"` returns nothing. T5 then adds `lib/cache/supabase-candle-store.integration.test.ts`, which reads `process.env` on purpose, so the check stops holding. Exclude `*.test.ts` from the grep, or say it only applies to non-test source, so the Executor doesn't hit an apparent contradiction.
- **P1-T6:** Unknown tickers never become "fresh", so every reload of a bad ticker spends 1 credit. That's acceptable for personal use, and the budget guard caps it. A short negative cache (for example, skip re-fetching a `not_found` series for 24 h using the `fetch_log` row) could come later.
- **P1-T6:** The minute and day budget guard isn't atomic across *different* symbols on separate serverless instances. Two cold loads could both pass at 7/8. Note this in Risks. It isn't worth extra locking for a single user.
- **P1-T4:** The 400 mapping `/symbol|not found|invalid/i` → `not_found` would also classify a bad-parameter message such as "invalid interval" as `not_found`. Consider matching `symbol` only.
- **P1-T8:** `generateMetadata` should handle `normaliseSymbol` returning null, the same way the page does (fall back to a generic title).
- **P1-T5 / P1-T9:** The integration cleanup deletes only `ZZTEST%` rows it created. That's reasonable, but add a line to the Open questions so Tom knowingly accepts it under the "ask before deleting data" rule.
- **P1-T6 case 10:** The single-provider-call result depends on microtask ordering between the two concurrent calls' freshness reads. If it turns out flaky, move the `inFlight` check before the freshness reads, or key the de-dupe on the whole `getChartCandles` call.
