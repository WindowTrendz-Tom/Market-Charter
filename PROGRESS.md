# PROGRESS

## Phase 1 – Chart for one ticker

### P1-T1 – Scaffold Next.js 16 app, Vitest and repo hygiene (built, awaiting code review)

**What changed**
- Scaffolded with `create-next-app@16.4.6` in a temp dir (flags per PLAN.md) and copied into the repo root: `app/`, `AGENTS.md`, `eslint.config.mjs`, `next.config.ts`, `tsconfig.json`, `package.json`, `README.md`. Removed `app/page.module.css`. No `cacheComponents` in `next.config.ts`.
- `package.json`: name `market-charter`, scripts `dev`, `build`, `start`, `lint` (`eslint`), `test` (`vitest run`), `test:watch`. Pinned exact: `vitest` 5.1.1, `lightweight-charts` 5.3.0, `@supabase/supabase-js` 2.119.2, `server-only` 0.0.1. `@types/node` ^22. `technicalindicators` and `@supabase/ssr` not installed.
- `vitest.config.mts` and `test/stubs/server-only.ts` as specified.
- `.gitignore` rewritten (union plus `!.env.example`). `.env.example` as specified.
- `test/env-example.test.ts` (3 tests: required keys, empty values, only `NEXT_PUBLIC_SUPABASE_URL` is public).
- `app/layout.tsx` (no Google fonts, `lang="en-NZ"`), `app/page.tsx` (link to `/chart/AAPL`), `app/globals.css`, `README.md` (with `## Database setup` placeholder for T2).
- `AGENTS.md` kept as generated. `BUILD_LOOP.md` not touched.

**Proof**
- `npm run build`: passes (routes `/` and `/_not-found`).
- `npm run lint`: passes, no output.
- `npm test`: 1 file, 3 tests passed.
- `grep -r "next/font" app` and `grep cacheComponents next.config.ts`: no matches.
- `git check-ignore -q .env.example` exits 1 (not ignored); `git check-ignore -q .env.local` exits 0 (ignored).
- `package.json` versions checked by eye against the plan.

**API credits used:** 0

**Issues:** none. Note: `/chart/AAPL` link on the home page 404s until P1-T8, as planned.

### P1-T2 – Supabase schema migration, DB types, env and admin client (built, awaiting code review)

**What changed**
- `supabase/migrations/20261125000000_initial_schema.sql`: exact SQL from PLAN.md (4 tables, RLS on, explicit grants, owner policies, one-pending-per-series lease index). Not applied to any live Supabase project.
- `lib/supabase/database.types.ts`: hand-written `Json` and `Database` types per the plan mapping.
- `lib/env.ts`: `ConfigError` (names only), `getTwelveDataApiKey`, `getSupabaseAdminConfig`; trims, empty = missing.
- `lib/supabase/admin.ts`: `createSupabaseAdminClient(options?: { fetch })`, no module-level client.
- `lib/env.test.ts`: 6 tests (missing names, whitespace, present values, message does not leak values).
- `README.md`: "Database setup" filled in.

**Proof**
- `npm run build`, `npm run lint` pass; `npm test`: 2 files, 9 tests passed.
- process.env grep (non-test source outside lib/env.ts): no output.
- Local throwaway PG16 validation (server stopped and temp dir removed afterwards):
  - `MIGRATION_OK`
  - service_role: first pending AAPL/1day insert OK; second: `ERROR: duplicate key value violates unique constraint "fetch_log_one_pending_per_series"`
  - anon `select * from candles`: `ERROR: permission denied for table candles`
  - `relrowsecurity`: candles, fetch_log, indicator_prefs, watchlist all `t` (4 rows)
  - authenticated as user 2 inserting watchlist row for user 1: `ERROR: new row violates row-level security policy for table "watchlist"`

**API credits used:** 0

**Issues:** none. `admin.ts` is not yet type-checked against a real project; `next build` type-checks it only if imported (it is not yet imported by a route), and vitest does not type-check. `npx tsc --noEmit` passes (checked separately).

### P1-T3 – Market calendar, NZ display formatters, symbol validation (built, awaiting code review)

**What changed**
- `lib/time/market-calendar.ts` (+ test): `zonedParts`, `zonedDateTimeToUtc` (two-pass offset, no hard-coded offsets), `addDays`, `dayOfWeek`, `expectedLatestDailyCandleDate`, `dailyCutoffInstant`, `isDailyCacheFresh`, `dateToDailyTs`, `dailyTsToDate`.
- `lib/time/display.ts` (+ test): `formatNzDate`, `formatNzDateTime`, `nzTickMarkLabel` (Pacific/Auckland, en-NZ).
- `lib/symbol.ts` (+ test): `normaliseSymbol`.

**Proof**
- `npm run build`, `npm run lint` pass; `npx tsc --noEmit` passes; `npm test`: 5 files, 27 tests passed. All plan cases covered (expected-date instants, DST cutoffs for Oct/Nov/Mar 2026, Thanksgiving freshness, NZ labels, symbol accept/reject).

**API credits used:** 0

**Issues:** none. Display tests compare after normalising whitespace, as the plan allows.

### P1-T4 – Data provider interface + Twelve Data implementation (built, awaiting code review)

**What changed**
- `lib/data-provider/types.ts`: `Interval`, `SUPPORTED_INTERVALS`, `Candle`, `DataProvider`, `ProviderError` (kinds per plan).
- `lib/data-provider/twelve-data.ts` (`server-only`): `TwelveDataProvider`, `INITIAL_OUTPUTSIZE = 5000`. Key sent in the `Authorization: apikey` header only; no `order` param; error-in-HTTP-200 handled; values sorted ascending and de-duped by ts.
- `lib/data-provider/index.ts`: `getDataProvider()` (single switch point).
- `lib/data-provider/twelve-data.test.ts` and `test/fixtures/twelve-data-time-series-1day.json` (6 synthetic bars, newest first, 3rd without volume).

**Proof**
- `npm run build`, `npm run lint`, `npx tsc --noEmit` pass; `npm test`: 6 files, 41 tests passed (15 new, all with a fake fetch that asserts host `api.twelvedata.com`; nothing hits the network).
- URL param sets asserted exactly for backfill and incremental calls, `order` absent in both.
- `grep -rn "twelvedata" app components`: no output.

**API credits used:** 0

**Issues:** none.

### P1-T5 – Candle store: interface, Supabase implementation, in-memory test double (built, awaiting code review)

**What changed**
- `lib/cache/candle-store.ts`: `CandleStore` interface, `FetchCompletion`, `FetchFinalStatus`, `StoreError`, `LEASE_TTL_MS`.
- `lib/cache/supabase-candle-store.ts` (`server-only`): `createSupabaseCandleStore(client)`. Paged reads (1000/page, 50-page cap), chunked upsert with `onConflict: "symbol,interval,ts"`, lease acquire (expire stale pending, insert with injected `created_at`, `23505` returns null), complete, `sumCreditsSince`. Non-lease errors throw `StoreError` with only the Supabase message.
- `test/helpers/memory-candle-store.ts`: `MemoryCandleStore` with `logRows`, `seedCandles`, `seedLog`, `failNext`.
- `test/helpers/candle-store-contract.ts`: shared contract (round trip, overwrite, latest ts, lease cycle, stale-lease expiry, independent series, ok-only `getLastOkFetchAt`, `sumCreditsSince` boundaries). It uses a fake clock in year 2100 so the credit sums only see its own rows, even against a database with real history.
- Tests: `test/memory-candle-store.test.ts`, `lib/cache/supabase-candle-store.test.ts` (fake fetch, cases a-e plus empty upsert and lease expiry/insert shape), `lib/cache/supabase-candle-store.integration.test.ts` (opt-in).

**Proof**
- `npm run build`, `npm run lint` clean; `npx tsc --noEmit` clean.
- Normal `npm test`: 8 files passed, 1 skipped (integration, 10 tests skipped); 60 passed.
- Integration, real Supabase project: `set -a; . ./.env.local; set +a; NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt RUN_SUPABASE_TESTS=1 npm test` gave 9 files / 70 tests all passed. Without `NODE_USE_ENV_PROXY=1` Node's fetch bypasses the sandbox proxy and fails with "fetch failed" (environment issue only).
- The integration test's cleanup deleted only `symbol like 'ZZTEST%'` rows from `candles` and `fetch_log`.

**API credits used:** 0 (Twelve Data not called; Supabase only)

**Issues:** none. Note the integration test writes fetch_log rows dated 2100-01-01 onward while it runs; they are removed by cleanup.

### P1-T6 – Cache-first candle service (freshness, budget guard, lease, de-dupe) (built, awaiting code review)

**What changed**
- `lib/candles/api-types.ts`: `ApiCandle`, `NoticeCode`, `Notice`, `ErrorCode`, `CandlesResponse`, `ErrorResponse` (types only, safe for the client).
- `lib/candles/limits.ts`: `CREDITS_PER_MINUTE = 8`, `CREDITS_PER_DAY = 800`, `CREDITS_PER_CALL = 1`, `BUSY_RETRY_SECONDS = 3`.
- `lib/candles/get-chart-candles.ts` (`server-only`): `getChartCandles(symbol, interval, { store, provider, now? })` returning `ChartCandlesResult`. Order: in-process de-dupe (synchronous, before any await, keyed `symbol:interval`, whole call shared) → freshness (`isDailyCacheFresh`) → minute/day budget guard → DB lease → provider call (`from` = last cached date, inclusive) → drop bars after the expected date → upsert → close lease → read all. Provider errors map per plan (rate_limited / not_found / forbidden / unavailable / auth / bad_response) via an exhaustive `Record<ProviderErrorKind, …>`. Every `StoreError` → 503 `cache_unavailable`. User-facing messages are the plan's exact text; cached responses are prefixed "Showing cached data. ". Provider messages stored in `fetch_log.message` are cut to 500 chars.
- `test/helpers/fake-provider.ts`: `FakeProvider` (records `calls`, queued results/errors, optional `delayMs`; no network).
- `lib/candles/get-chart-candles.test.ts`: 27 tests (MemoryCandleStore + FakeProvider + fixed clock, synthetic data).

**Proof**
- `npm run build` passes; `npm run lint` clean; `npx tsc --noEmit` clean.
- `npm test`: 9 files passed, 1 skipped (Supabase integration); 87 passed, 10 skipped. New file: 27/27.
- All 14 plan cases are covered and assert `provider.calls` and `store.logRows()`:
  1 backfill (`from` undefined, one `ok` row, credits 1); **2 second load = 0 provider calls, still 1 log row, `source:"cache"`** (unit proof of acceptance #3); 3 incremental `from:"2026-11-20"`, 11-25 not stored, result ends 11-24, repeat 0 calls; 4 Thanksgiving clause (b), repeat 0 calls; 5 minute guard with/without cache (429, retry 60, no new row; 7 credits still allowed); 6 day guard (800 since UTC midnight, retry 25200 s at 17:00Z); 7 provider 429 with/without cache (row `rate_limited`, credits 1); 8 lease held 10 s ago (503 busy retry 3 / stale + `busy` notice); 9 lease 61 s old → `expired`, new `ok` row; 10 `Promise.all` with 20 ms delay → 1 call, identical results, 1 row; 11 not_found → 404, row `not_found`; 12 unavailable with cache → stale + `provider_unavailable`, row `error`; 13 store failure (`getLatestCandleTs`, plus `getLastOkFetchAt`, `sumCreditsSince`, `acquireFetchLease`) → 503 `cache_unavailable`, 0 calls; 14 `completeFetchLease` failure → still `ok:true`.
- Extra cases: forbidden → 403; auth/bad_response → 502 `provider_error` with 500-char log message and a server-side `console.error`; non-provider error → lease closed `error` and rethrown; successful call leaving the series empty → 404.
- `grep -rn "twelve-data" lib/candles/`: no output (the service imports only types from `@/lib/data-provider/types`).

**API credits used:** 0 (FakeProvider only; no Twelve Data or Supabase calls)

**Issues / decisions for review** (small points the plan didn't spell out)
- De-dupe uses `load(...).finally(() => inFlight.delete(key))` and returns the shared promise, rather than the plan's `try { return await p } finally {…}`. Same behaviour; the map entry is removed only if it is still the same promise.
- `upsertCandles` failure after a successful call: the lease is closed best-effort as `error` / "Saving candles failed" (not `ok`, so the cache doesn't look fresh), then 503 `cache_unavailable`. The plan only said "any StoreError → 503".
- `completeFetchLease` failures are tolerated (logged) on provider-error paths too, not only after success, so the provider outcome is still reported; the pending row expires after 60 s.
- A non-`ProviderError` throw from the provider closes the lease as `error` and is rethrown; P1-T7's route turns it into a 500.
- Notice text when serving cache after `not_found` / `forbidden`: code `provider_error` (per plan), message = the not_found / forbidden text.
- Re P1-T5 optional note: expired leases keep `credits_used = 1`, so the budget guard counts them. This is intended (conservative).
