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

### P1-T7 – API route `GET /api/candles/[symbol]` (built, awaiting code review)

**What changed**
- `app/api/candles/[symbol]/route.ts`: `force-dynamic`; awaits `params`; validates symbol (400 `invalid_symbol`) and interval (400 `invalid_interval`); builds store and provider (`ConfigError` logs only the missing var names, returns 500 `config`); calls `getChartCandles`; maps `Candle.ts` to `time` in UTC seconds; failures pass through status, code, message and `Retry-After`; every response is `Cache-Control: no-store`; any other throw returns a generic 500 `provider_error` and logs only the error message.
- `app/api/candles/[symbol]/route.test.ts`: 8 tests with mocked service, store, admin client and provider factory.

**Proof**
- `npm run build` passes and lists `ƒ /api/candles/[symbol]`; `npm run lint` clean; `npm test`: 10 files passed, 1 skipped; 95 passed, 10 skipped (8 new).
- Tests cover 200 shape and no-store, invalid symbol and interval (service not called), 429 with `Retry-After: 60`, busy 503 with `Retry-After: 3`, config error 500 with no env value, var name or stack in the body, unexpected throw (generic body), and stale result with notice as 200.

**API credits used:** 0

**Issues:** none.

### P1-T8 – Chart page (v5 API), NZ-time labels, footer attribution (built, awaiting code review)

**What changed**
- `lib/chart/to-chart-data.ts` (+ test): sorted, de-duped (first bar per time wins) `CandlestickData<UTCTimestamp>[]`, type-only imports.
- `components/site-footer.tsx` (+ test), added to `app/layout.tsx` after `<main>`; small footer style in `app/globals.css`.
- `components/candle-chart.tsx`: client component, v5 `chart.addSeries(CandlestickSeries, {}, 0)`, NZ `timeFormatter` and `tickMarkFormatter`, `attributionLogo: true`, `chart.remove()` on cleanup.
- `components/chart-view.tsx`: loading / ready / error state; busy 503 retry (max 3, honours `Retry-After`); setState only after an await; unparsable body, network failure and empty candles give the plan's messages.
- `app/chart/[symbol]/page.tsx`: awaits `params`, `normaliseSymbol` then `notFound()`; `generateMetadata` never throws.

**Proof**
- `npm run build` passes, lists `ƒ /chart/[symbol]`; `npm run lint` clean; `npx tsc --noEmit` clean; `npm test`: 12 files passed, 1 skipped; 98 passed, 10 skipped (3 new).
- Secret-leak check (dummy values): `LEAK_CHECK_OK`.
- v5 grep: no `add*Series(` matches in app/components/lib; `addSeries(CandlestickSeries` appears once (`components/candle-chart.tsx:28`).
- Dev server with the three env vars unset (`.env.local` moved aside during the check, then restored): `/chart/AAPL` HTML contains "TradingView Lightweight Charts" (count 1) and `<h1>AAPL`; `/api/candles/AAPL` returns 500 `{"error":{"code":"config","message":"Server configuration is incomplete."}}`; `/chart/%3B` returns 404.

**API credits used:** 0 (no provider or Supabase calls; the route failed on config before any call).

**Issues / notes**
- The "Loading AAPL…" text and the red error box are client-rendered after hydration, so they were not checked by curl; the loading text is in the SSR HTML only split by React comment markers. The error-box path was not seen in a browser (no browser here); it is covered by code reading only.
- Components have no render tests beyond the footer (plan only asked for that).

### P1-T9 – Live acceptance proof (run in cloud session with live keys; awaiting review)

**What changed:** no code. Evidence screenshots added in `docs/evidence/`: `p1-t9-aapl-desktop.png` (1280x800 @2x, first load, "Source: Twelve Data (just fetched)"), `p1-t9-aapl-phone.png` (390x844 @2x, "Source: Supabase cache"), `p1-t9-bad-ticker.png`.

**Proof** (Supabase counts read with a small script using the secret key; nothing printed)
- Step 1 (RLS query on pg_class): NOT run. No SQL editor access in this session; the migration was applied beforehand by the orchestrator. Please confirm in the SQL editor.
- Step 2: `RUN_SUPABASE_TESTS=1 npm test` → 13 files passed, 108 tests passed, 0 skipped (integration contract included). `npm run lint` clean; `npm run build` passes. After the run `fetch_log` total = 0 (ZZTEST cleanup worked).
- Step 4/5 before: AAPL fetch_log rows = 0, candles = 0. After first load (browser, desktop): 1 row `{id 43, 1day, credits_used 1, status ok, candles_received 5000}`; candles = 5000, min ts 2007-01-11, max ts 2026-11-24 (latest completed US session as of 2026-11-25 NZ). Page shows chart, "Last candle: 24 Nov 2026 · Source: Twelve Data (just fetched)", footer TradingView notice and link.
- Step 6: reloaded twice (phone viewport, then desktop) plus `curl /api/candles/AAPL` → `cache 5000`. fetch_log AAPL rows before 1, after 1 (id 43 only); candles still 5000. Acceptance #3 met.
- Step 7: `/chart/ZZZZQX` shows `No US ticker "ZZZZQX" was found at Twelve Data.`; 1 fetch_log row `{id 44, status not_found, credits 1}`.
- Step 8: 3 parallel curls on never-loaded MSFT → 200, 200, 200; MSFT fetch_log rows = 1 (`id 45, ok, 5000`); candles 5000.
- Step 9: Playwright request log on `/chart/AAPL` (first load and repeats): only `GET /chart/AAPL` and `GET /api/candles/AAPL` (plus `/_next/` assets); no external requests.
- Step 10 (Vercel preview): PENDING, needs Tom (Vercel not linked).
- Step 11 (next-trading-day refresh): not yet possible; do on the next US trading day (expect exactly 1 new ok row).

**API credits used:** 3 in this task (AAPL, ZZZZQX, MSFT), plus 1 earlier key check = 4 today. ZZZZQX and MSFT were ~9 s apart, AAPL ~80 s before; peak 2/min.

**Issues / notes**
- Backfill returned exactly 5000 bars from 2007-01-11 (hit the outputsize cap, as planned).
- One transient `fetch failed` on a Supabase count query via the proxy; retry succeeded. Not an app error.
- Acceptance boxes for Phase 1 can be ticked except the Vercel step.

### P1-T9 – RLS check (run by orchestrator via Supabase Management API)
`select relname, relrowsecurity from pg_class where relnamespace='public'::regnamespace ...` →
candles=true, fetch_log=true, indicator_prefs=true, watchlist=true (4 rows, all true).

### P2-T1 – Auth foundation (awaiting review)

**What changed**
- Installed `@supabase/ssr@0.12.7` (exact).
- `lib/config-error.ts` now holds `ConfigError` and `readEnv` (no `server-only`); `lib/env.ts` imports `readEnv` and re-exports `ConfigError`. `lib/env.test.ts` unchanged and passing.
- New: `lib/supabase/public-config.ts`, `lib/supabase/server.ts` (`createSupabaseServerClient`, assigns to `SupabaseClient<Database>` directly, so no alias needed), `lib/supabase/proxy.ts` (`updateSession`, Supabase pattern verbatim, `getClaims()` straight after client creation), `lib/auth/session.ts` (`getAuthContext`), `lib/auth/next-path.ts`, `lib/auth/route-access.ts`, root `proxy.ts`. Tests for each non-server-only module.
- `.env.example` gains the publishable key and optional E2E vars; `test/env-example.test.ts` updated; README "Auth" section added.

**Proof**
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test`: 17 files passed, 1 skipped; 127 passed, 10 skipped; `npm run build` passes and prints `ƒ Proxy (Middleware)`.
- `grep server-only` on the five proxy-side modules: no output. `grep -rln process.env lib app components proxy.ts` (non-test): only `lib/config-error.ts`.
- `npm run dev` with real `.env.local`: `/chart/AAPL` -> `307 http://localhost:3000/login?next=%2Fchart%2FAAPL`; `/_next/static/x.js` -> 404 (not 307).

**API credits used:** 0.

**Issues / notes**
- Signing-key type for the new project (O0, orchestrator, Management API): ES256 `in_use`, HS256 `previously_used`. No code change needed.

### O0 – New Sydney project setup (orchestrator)
- Project `oxepsjesqzpkmljajwti`, region ap-southeast-2, ACTIVE_HEALTHY. Old Japan project deleted by Tom.
- Phase 1 migration re-applied unchanged; RLS true on candles, fetch_log, indicator_prefs, watchlist.
- `.env.local` rewritten (URL, publishable + secret keys; values never printed). Sandbox network: new host allowed, old host removed.
- Auth config read: disable_signup=false, password_min_length=6, email enabled, anonymous disabled, site_url=http://localhost:3000 (O3 changes these before T9).
- Phase 1 Vercel check: deployment `market-charter-djcgk6xgi-windowtrendz.vercel.app` (function region syd1) → `GET /api/candles/AAPL` 200, 5000 candles, source `api` (1 credit), stored in the new project.

### P2-T1 fix round 1
- `lib/auth/next-path.ts`: `safeNextPath` now returns `/` for any control character (U+0000-U+001F, U+007F), closing the open redirect via `/\t/evil.com` (URL parsers strip tab/CR/LF). Tests added for tab, LF, CR and DEL.
- Optional items also done: comment in `lib/supabase/server.ts` on the ignored `headers` argument; console spy restored in `afterEach` (`vi.restoreAllMocks()`) in `lib/supabase/proxy.test.ts`.

### P2-T2 – Login, logout, protected app shell, auth on the candles route (awaiting review)

**What changed**
- New: `app/login/{page,login-form,actions}.ts(x)` (email + password via `signInWithPassword`, `redirect(next)` outside any try), `app/(app)/layout.tsx` (auth check, header with email and Log out, sidebar placeholder), `app/(app)/actions.ts` (`signOut`), `lib/auth/sign-in-error.ts`, `lib/http/json.ts`, `lib/http/fetch-with-auth-retry.ts` (each with tests).
- Moved with `git mv`: `app/page.tsx` and `app/chart/[symbol]/page.tsx` into `app/(app)/`.
- Candles route: `getAuthContext()` first inside the outer try; ConfigError gives 500 `config` (names logged only), no user gives 401 `unauthorized`; then symbol and interval validation as before. Uses `errorJson`, `jsonNoStore`, `invalidSymbolMessage`.
- `lib/candles/api-types.ts`: `ErrorCode` extended. `lib/symbol.ts`: `invalidSymbolMessage` (+ test).
- `components/chart-view.tsx`: `fetchWithAuthRetry`; final 401 shows the "session has expired" box with a login link carrying `next`.
- `app/globals.css`: removed duplicate first `footer` block, `main` max-width 1400px, app-shell/header/sidebar/content/muted/login-form styles and the 800px breakpoint.

**Proof**
- `npx tsc --noEmit` clean (after clearing stale git-ignored `.next` types from the old page paths); `npm run lint` clean; `npm test`: 20 files passed, 1 skipped; 146 passed, 10 skipped (route test now 10 cases: 8 old + 401 + auth ConfigError); `npm run build` passes: routes `/`, `/chart/[symbol]`, `/login`, `/api/candles/[symbol]`, `ƒ Proxy (Middleware)`.
- `git status`: both page files show as renames (R).
- Dev server, logged out: `/api/candles/AAPL` -> 401; `/` -> 307 to `http://localhost:3000/login`; `/login` -> 200 containing "Log in" and the password input.
- `grep -rn signUp app lib components` -> no output.
- A real login was not exercised (planned for T9 after O2).

**API credits used:** 0.

**Issues / notes**
- React SSR emits the attribute as `autoComplete="current-password"` (camelCase) in the HTML; HTML attribute names are case-insensitive, so browsers treat it as `autocomplete`. The plan's literal-lowercase grep will not match.
- Existing "invalid symbol" and "invalid interval" route cases now also pass through auth first (mocked as logged in), as the plan specifies.

### P2-T2 fix round 1
- `lib/auth/sign-in-error.ts`: a missing or zero status (auth-js `AuthRetryableFetchError` reports `status: 0` on network failure) now maps to "Couldn't reach the login service. Try again shortly." (`!status || status >= 500`). Test added for `signInErrorMessage(0)`.
- Optional items not actioned (not blocking).

### P2-T3 – Provider: `searchSymbols` + US-listing rule (awaiting review)

**What changed**
- `lib/data-provider/types.ts`: `SymbolMatch` and `DataProvider.searchSymbols`.
- `lib/data-provider/twelve-data.ts`: fetch, parse and error mapping extracted into private `requestJson(path, params)` (returns `null` for 400 "no data is available"); `getCandles` uses it; new `searchSymbols` (`/symbol_search`, `symbol` + `outputsize=30`, skips items without a symbol, keeps provider order, missing `data` gives `bad_response`).
- `lib/symbols/us-listing.ts`: `US_MIC_CODES`, `US_COUNTRY`, `pickUsListing` (exact symbol match, US by country or MIC, prefers Common Stock then ETF then first), `summariseMatches`.
- `test/helpers/fake-provider.ts`: `searchCalls`, `enqueueSearch`, `searchSymbols`.
- New: `test/fixtures/twelve-data-symbol-search.json` (synthetic), `lib/symbols/us-listing.test.ts`; new `describe("searchSymbols")` in `twelve-data.test.ts`.

**Proof**
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test`: 21 files passed, 1 skipped; 165 passed, 10 skipped (all existing `twelve-data.test.ts` cases untouched and passing); `npm run build` passes.
- `grep -rn symbol_search app components` -> no output.

**API credits used:** 0 (fake fetch only).

**Issues / notes**
- The final "unexpected response" `bad_response` in `getCandles` (HTTP 200, body not `status: ok` with `values`) no longer carries `httpStatus`, because the status is not returned from `requestJson`. Nothing reads `httpStatus` today.

### P2-T4 – Shared credit budget + logged, guarded US symbol check (awaiting review)

**What changed**
- New `lib/candles/messages.ts`: `LIMIT_MESSAGES` (`minute`, `day`, `provider`) and `CACHE_UNAVAILABLE_MESSAGE`, text moved verbatim from `get-chart-candles.ts`.
- New `lib/candles/credit-budget.ts`: `checkCreditBudget(store, now)` (minute sum >= 8 gives `{minute, 60}`, day sum since UTC midnight >= 800 gives `{day, secondsUntilNextUtcMidnight}`), plus exported `startOfUtcDay` and `secondsUntilNextUtcMidnight` (moved).
- New `lib/cache/complete-lease.ts`: `completeLeaseBestEffort` moved from `get-chart-candles.ts`, same body.
- `lib/candles/limits.ts`: `MAX_LOG_MESSAGE_LENGTH = 500` (local constant removed from the candle service).
- `lib/candles/get-chart-candles.ts`: uses `checkCreditBudget`, `completeLeaseBestEffort`, `LIMIT_MESSAGES`, `CACHE_UNAVAILABLE_MESSAGE`. No behaviour change.
- `lib/cache/candle-store.ts`: `LogInterval = Interval | "symbol_search"`; `acquireFetchLease` takes `LogInterval`. No other signature changes; the Supabase store compiles unchanged.
- `test/helpers/memory-candle-store.ts`: `MemoryLogRow.interval` and `acquireFetchLease` use `LogInterval`.
- New `lib/symbols/check-us-symbol.ts` (`server-only`): `checkUsSymbol(symbol, { store, provider, now? })`: budget guard (429, no row) -> lease on (symbol, `symbol_search`) (503 busy) -> `provider.searchSymbols` (provider errors mapped as per the plan; `not_found` treated as no matches) -> `pickUsListing` (`ok` / 422 `not_us` / 404 `not_found`, match summary logged). Every completed lease logs 1 credit, `candlesReceived: null`, message cut to 500. `StoreError` anywhere gives 503 `cache_unavailable`.
- New tests: `lib/candles/credit-budget.test.ts` (7), `lib/symbols/check-us-symbol.test.ts` (18: all 11 plan cases, case 9 split per error kind, plus empty result, message cut to 500, non-provider error rethrown, failed lease completion).

**Proof**
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test`: 23 files passed, 1 skipped; 190 passed, 10 skipped (was 165; +7 budget, +18 symbol check); `npm run build` passes (same routes as T3).
- `lib/candles/get-chart-candles.test.ts`: 27/27 pass; `test/memory-candle-store.test.ts` (store contract): 12/12 pass. Both files and `test/helpers/candle-store-contract.ts` unchanged (`git status` shows no change; blob hashes identical before and after).
- `grep -n "sumCreditsSince" lib/candles/get-chart-candles.ts` -> no output.
- `grep -rn "Twelve Data's free-plan limit" lib` -> 1 hit in source (`lib/candles/messages.ts`), plus 2 expected-string hits in the unchanged `get-chart-candles.test.ts` (that file must not be edited, so the hits stay).
- `.env.example` unchanged (no new env vars).

**API credits used:** 0 (FakeProvider + MemoryCandleStore only).

**Issues / notes**
- The `fetch_log` log-row interval for searches is the literal `"symbol_search"` (constant `SEARCH_LOG_INTERVAL` in `check-us-symbol.ts`). `getLastOkFetchAt` still takes `Interval` only, as the plan says, so search rows can't be read back through it.

### P2-T5 – Recent candles read, quote maths, display formatters (awaiting review)

**What changed**
- `lib/cache/candle-store.ts`: `getRecentCandles(symbol, interval, count)` added to `CandleStore` (last `count` candles, ascending).
- `lib/cache/supabase-candle-store.ts`: implements it (`order ts desc`, `limit count`, reversed; error gives `StoreError("Supabase getRecentCandles failed: ...")`). Row-to-`Candle` mapping extracted into a shared `toCandle` used by `getCandles` too (no behaviour change).
- `test/helpers/memory-candle-store.ts`: memory implementation using `enter("getRecentCandles")`.
- `test/helpers/candle-store-contract.ts`: new case (3 candles, last 2 ascending; unknown series gives `[]`).
- `lib/cache/supabase-candle-store.test.ts`: 2 new tests (URL has `order=ts.desc` and `limit=2`, ascending result; 500 gives `StoreError`).
- New `lib/watchlist/api-types.ts` (types only), `lib/watchlist/quote.ts` (`toQuote`, imports only `market-calendar`, no `server-only`), `lib/watchlist/format.ts` (`formatPrice`, `formatChangePct`, `changeClass`; browser-safe), with `quote.test.ts` (8) and `format.test.ts` (8).

**Proof**
- `npm run build`, `npm run lint`, `npx tsc --noEmit` clean. `npm test`: 25 files passed, 1 skipped; 209 passed, 11 skipped.
- Opt-in Supabase run (`RUN_SUPABASE_TESTS=1`): 26 files, 220 tests all passed, so the new contract case also passes against real Supabase.
- `quote.ts` imports only `@/lib/data-provider/types` (type), `@/lib/time/market-calendar` and `./api-types` (type).

**API credits used:** 0.

**Issues / notes**
- None. The plan's `WatchlistRefreshResponse` reuses `Notice` from `lib/candles/api-types.ts`.

### P2-T6 – Watchlist store (RLS-scoped) + watchlist service (awaiting review)

**What changed**
- New `lib/watchlist/limits.ts`: `MAX_WATCHLIST_ITEMS = 30`, `REFRESH_PACE_MS = 10_000`, `REFRESH_BUSY_RETRY_MS = 3_000`, `MAX_REFRESH_BUSY_RETRIES = 3`.
- New `lib/watchlist/watchlist-store.ts`: `WatchlistRow`, `WatchlistStore` (`list`, `insert` -> `"ok" | "duplicate"`, `remove` -> boolean, `setSortOrders`). Errors throw the existing `StoreError`.
- New `lib/watchlist/supabase-watchlist-store.ts` (`server-only`): `createSupabaseWatchlistStore(client: SupabaseClient<Database>)`, for the user-scoped server client only. `list` orders `sort_order, created_at`; `insert` sends `{symbol, sort_order}` only (no `user_id`, column default `auth.uid()`), 23505 -> `"duplicate"`; `remove` = `delete().eq("symbol").select("symbol")` -> rows returned > 0; `setSortOrders` = one `update({sort_order}).eq("symbol")` per row via `Promise.all`, first error -> `StoreError`.
- New `test/helpers/memory-watchlist-store.ts`: same semantics (insertion order stands in for `created_at`), `failNext(method)`, `rows()`.
- New `lib/watchlist/watchlist-service.ts` (`server-only`): `listWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `reorderWatchlist`, `refreshWatchlistSymbol` as specified. A shared `guardStore` wrapper turns any `StoreError` into 503 `cache_unavailable` (logged); private `readQuote` reads the last 2 cached daily candles + last ok fetch (0 credits). Add order: parse -> duplicate (409) -> full (409) -> `checkUsSymbol` (failure returned as is) -> insert at `max(sortOrder)+1` (or 0) -> cached quote. Refresh: parse -> not in list (404, 0 calls) -> `getChartCandles` (failure returned as is) -> quote from the last 2 returned candles.
- Tests: `supabase-watchlist-store.test.ts` (10, fake fetch) and `watchlist-service.test.ts` (38 incl. parameterised cases; plan cases 1–15 plus extras: first add gets 0, invalid-symbol message, insert failure -> 503, candle cache failure in list -> 503, unchanged reorder makes no update, refresh failure passthrough (429), refresh/remove invalid symbol).

**Proof**
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test`: 27 files passed, 1 skipped; 257 passed, 11 skipped (was 209 + 11; +48 new); `npm run build` passes (same routes as T5).
- `grep -rn "createSupabaseAdminClient" lib/watchlist` -> no output.
- Service tests use a distinct synthetic symbol per test (`getChartCandles` in-flight map).

**API credits used:** 0 (FakeProvider, MemoryCandleStore, MemoryWatchlistStore and fake fetch only; no Supabase or Twelve Data calls).

**Issues / notes**
- Reorder validation reads "each passing `normaliseSymbol` to the same value" as `normaliseSymbol(s) === s`, so a lower-case or padded symbol (`"bada"`) is a 400 `invalid_body`. The client always sends the symbols it got from `GET /api/watchlist`, which are already normalised.
- Plan case 11 (`[C,A,B]` from `[A,B,C]`): with sort orders 0,1,2 every row changes, so "only the changed rows" is proved by seeding A=1, B=2, C=5 (only C is updated); the 0,1,2 case is a separate test (all three updated).
- No opt-in Supabase integration test for the watchlist store in this task (the plan has none; it needs a real user session, which arrives with O2 / P2-T9).

### P2-T7 – Watchlist API routes (awaiting review)

**What changed**
- New `lib/watchlist/deps.ts` (`server-only`): `buildWatchlistDeps(supabase)` = user-scoped watchlist store + admin-client candle store + `getDataProvider()`. May throw `ConfigError`.
- New `app/api/watchlist/route.ts`: `GET` (list), `POST {symbol}` (201), `DELETE ?symbol=` (204, no body), `PATCH {symbols}` (saves, then re-lists). `force-dynamic`, all responses `no-store`.
- New `app/api/watchlist/refresh/route.ts`: `POST {symbol}` returns `{ item, source, notice }`; failures (including `ChartCandlesFailure`) map through `errorJson` with `Retry-After`.
- New `lib/watchlist/route-handler.ts` (not listed in the plan): shared flow used by every handler, so the common flow isn't copy-pasted five times. `withWatchlistDeps` (auth -> 401, deps, `ConfigError` -> 500 `config` with names logged only, other throw -> generic 500 `provider_error`, message only logged), `readJsonObject`, `invalidBodyJson`, `failureJson`.
- Tests: `app/api/watchlist/route.test.ts` (15 cases incl. per-method 401) and `app/api/watchlist/refresh/route.test.ts` (6). Mocks: session, deps, service.

**Proof**
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test`: 29 files passed, 1 skipped; 282 passed, 11 skipped (was 257; +25); `npm run build` lists `ƒ /api/watchlist` and `ƒ /api/watchlist/refresh`.
- Dev server, logged out: `GET /api/watchlist` -> 401; `POST /api/watchlist/refresh` -> 401.

**API credits used:** 0.

**Issues / notes**
- The extra file `route-handler.ts` is the only deviation from the plan's file list; behaviour matches the plan's common flow.
- `deps.ts` uses the admin client for the candle cache only, as the plan specifies. The T6 grep (`lib/watchlist`) now hits `deps.ts` for that reason; the service and store files still never use it.
