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
