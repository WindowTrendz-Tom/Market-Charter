VERDICT: APPROVED

# Code review: P2-T4 (shared credit budget + logged, guarded US symbol check), round 1

## Checks run by the reviewer
- `npm test`: 23 files passed, 1 skipped (Supabase integration, opt-in only); 190 passed, 10 skipped.
- `npx vitest run lib/candles/get-chart-candles.test.ts test/memory-candle-store.test.ts`: 39/39 (27 candle-service + 12 store contract).
- `git diff --quiet HEAD -- lib/candles/get-chart-candles.test.ts test/helpers/candle-store-contract.ts test/memory-candle-store.test.ts`: exit 0, so all three are byte-for-byte unchanged.
- `npm run lint`: clean. `npx tsc --noEmit`: clean. `npm run build`: passes (same routes as P2-T3).
- `grep -n "sumCreditsSince" lib/candles/get-chart-candles.ts`: no output.
- `grep -rn "Twelve Data's free-plan limit" lib`: 1 source hit (`lib/candles/messages.ts:3`) plus 2 expected-string hits in `lib/candles/get-chart-candles.test.ts:138,156` (see below).
- Zero Twelve Data calls: every test uses FakeProvider + MemoryCandleStore; the only live suite is Supabase-only and gated on `RUN_SUPABASE_TESTS=1`.

## "Done when"
| Check | Result |
|---|---|
| New tests pass (credit-budget 7, check-us-symbol 18, all 11 plan cases covered) | Pass |
| 27 `get-chart-candles` tests + store contract pass, files untouched | Pass |
| build / lint / test / tsc | Pass |
| No `sumCreditsSince` in `get-chart-candles.ts` | Pass |
| "Twelve Data's free-plan limit" → exactly 1 hit | Pass on intent (see below) |

**The "exactly 1 hit" grep.** The extra two hits are expected-value literals in `get-chart-candles.test.ts`, which this task forbids editing. The check exists to prove that the message text has a single source definition, and it does: `lib/candles/messages.ts` is the only non-test hit. The plan's grep was written without accounting for the frozen test file. Editing the test to satisfy the grep would break the stronger "unchanged tests" requirement, so this does not block.

## Constraints and robustness
- **One route to search, always guarded and logged.** `provider.searchSymbols` is called in exactly one place outside the provider: `lib/symbols/check-us-symbol.ts:86`. That call comes after `checkCreditBudget` (line 69; 429, no row, 0 calls) and after `acquireFetchLease(symbol, "symbol_search", now)` (line 73). The lease row is inserted with `credits_used: 1`, so a search in flight already counts towards the 8/min and 800/day budget. `sumCreditsSince` sums across every interval, so search and candle credits share the budget. A test covers this (`credit-budget.test.ts:32`).
- **Leases can't leak.** After the lease is acquired, every exit closes it. That covers each `ProviderErrorKind` branch (the switch is exhaustive over the 6-member union, and tsc proves `matches` is assigned), a non-`ProviderError` (closed as `error` and then rethrown), and all three `pickUsListing` outcomes. Closing goes through `completeLeaseBestEffort`, which never throws, and `LEASE_TTL_MS` expiry is still the backstop. A refused budget or a busy lease writes no row and makes 0 calls.
- **Schema.** In `supabase/migrations/20261125000000_initial_schema.sql`, `fetch_log."interval"` is plain `text not null` with no CHECK. The only interval CHECK is `candles_interval_valid` on `candles`, which search never writes. The partial unique index `fetch_log_one_pending_per_series (symbol, "interval") where status='pending'` keys search leases separately from `1day` leases, which matches plan case 8 and its test. `getLastOkFetchAt` filters on interval, so search rows can't make a candle series look fresh (case 11). No migration was added, so there is no schema change.
- **Supabase store.** `acquireFetchLease` is contextually typed from `CandleStore`, so it now takes `LogInterval` with no code change, as the plan expected.
- **Behaviour-preserving refactor.** The message text moved verbatim. `startOfUtcDay`, `secondsUntilNextUtcMidnight` and `completeLeaseBestEffort` have identical bodies. Minute check then day check, in the same order, with the same retry seconds.
- **Error handling.** Provider 429 → 429 + `rate_limited` row. `unavailable` → 502. `forbidden`/`auth`/`bad_response` → 502 + `console.error`. `StoreError` → 503 `cache_unavailable`. An empty result → 404 `not_found` with "no matches" logged. Log messages are cut to 500.
- **Other constraints.** `server-only` is imported, no secrets, no new env vars, no `any`.
- **Scope.** Nothing beyond the task; `checkUsSymbol` isn't wired into a route yet, as planned.

## Optional (non-blocking)
1. The 60-second retry value is now defined three times: `get-chart-candles.ts` `RATE_LIMIT_RETRY_SECONDS`, `credit-budget.ts:6` `MINUTE_RETRY_SECONDS` and `check-us-symbol.ts:27` `RATE_LIMIT_RETRY_SECONDS`. One shared constant in `lib/candles/limits.ts` would remove the duplication.
2. `lib/symbols/check-us-symbol.ts:56`: the console prefix reads "Candle cache error (AAPL symbol_search)". "Symbol check cache error" would be clearer when reading the server logs.
3. `lib/candles/limits.ts`: the comment on `CREDITS_PER_CALL` mentions only `time_series`, but the constant now also prices `symbol_search` at 1 credit. Updating the comment would avoid confusion.
