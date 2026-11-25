VERDICT: APPROVED

# Plan Review – Phase 1, round 2

I re-reviewed the whole of `PLAN.md` (round 2) against `BUILD_LOOP.md`, and checked that the round 1 fixes didn't introduce new problems. The repo is unchanged: there's no app code yet.

## Summary of checks

| Check | Result |
|---|---|
| 1. Acceptance criteria covered | Pass. Chart page: T7, T8, T9. Cache-first fetch and store: T3, T5, T6, T9. Second load uses zero calls: T6 case 2, T9 step 6. Footer attribution: T8. The definition of done (build/lint/test, PROGRESS.md, `.env.example`) is covered by T1 and the per-task checks. |
| 2. Hard constraints | Pass. The key is server-only: `server-only` imports, lazy env reads, the `Authorization` header and the T8 leak check. The cache is checked before fetching. Every Twelve Data call gets exactly one `fetch_log` row through the lease. Rate-limit messages are clear. The provider interface `getCandles(symbol, interval, from?)` lives in `lib/data-provider/`. Footer attribution, the v5 `addSeries(CandlestickSeries, …, 0)` call with grep guards, UTC storage / Pacific/Auckland display and the no-secrets rules are all covered. No indicator endpoints are used. |
| 3. Order, size, testable "done when" | Pass. Dependencies run in order (T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9), and every task has checks that can be run. |
| 4. Scope, stack, schema | Pass. The four tables come from the brief's data model, and the refinements are disclosed under "Decisions taken". No stack changes. Phase 2/3 packages are deferred. |
| 5. Credit estimate | Pass. About 4 credits expected, 15 or fewer with retries, and no more than 3 in any minute, against 8/min and 800/day. |
| Live-key split | Sound. T1–T8 are fully provable offline with fakes, the in-memory store and the local PG16 run. Acceptance boxes are ticked only with T9's live proof. Open question 1 hands the keys and network decision to Tom. |

## Round 1 fixes checked

- **Required item 1 (P1-T4, `order=asc`): fixed.** No `order` parameter is sent, so the default `desc` gets the newest 5,000 bars, and step (d) sorts ascending locally. The fixture is newest-first. The tests assert that `order` is absent, that the parameter set is exact, and that the output is ascending. T9 step 6 still checks `max(ts)` against the expected latest trading date. No new issues. The incremental path (`start_date` with the default order) only ever covers a gap of a few bars.
- **De-dupe moved to the start of `getChartCandles`:** consistent with the "Order of operations" section. It's synchronous before the first await, so T6 case 10 is now deterministic. A follower that shares the leader's fresh-cache result is correct.
- **T2 `process.env` grep:** now excludes `*.test.ts(x)` lines, so it no longer conflicts with T5's opt-in integration test. The command is valid GNU grep.
- **T4 400 mapping narrowed to `/symbol/i`:** still matches Twelve Data's invalid-symbol wording. It's tested both ways, and "No data is available" is checked first.
- **T8 `generateMetadata` null fallback, T6 risk notes, ZZTEST deletion disclosure:** all applied and consistent with the rest of the plan.

## Optional (not blocking)

- **P1-T9:** In step 6, also record the AAPL `count(*)` next to `max(ts)` (about 5,000 rows expected). That would confirm the backfill depth as well as how recent it is.
- **P1-T9:** The task can't run in this environment, so the orchestrator should stop and ask Tom (open question 1) after T8 is approved rather than attempt T9.
