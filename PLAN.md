# PLAN – Phase 1: Chart for one ticker

Planner draft, round 2 (2026-11-25). Revised after PLAN_REVIEW.md round 1; see "Review round 1 fixes" at the bottom.

---

## Verified facts (checked 2026-11-25, not from memory)

### Versions (`npm view`, Node 22.23.5 / npm 10.9.9 installed)
| Package | Latest | Use in Phase 1 |
|---|---|---|
| `next` / `create-next-app` | 16.4.6 | Yes. Scaffold with `create-next-app@16.4.6`; it pins `next` 16.4.6, `react`/`react-dom` 19.3.0, `eslint` ^9 (9.39.5), `eslint-config-next` 16.4.6, `typescript` ^5 |
| `lightweight-charts` | 5.3.0 | Yes, pinned exact |
| `@supabase/supabase-js` | 2.119.2 | Yes, pinned exact |
| `server-only` | 0.0.1 | Yes, pinned exact |
| `vitest` | 5.1.1 | Yes (dev), pinned exact |
| `technicalindicators` | 3.1.0 (last published 2023-07-12) | **Not installed until Phase 3** |
| `@supabase/ssr` | 0.12.7 | **Not installed until Phase 2** (auth) |
| `typescript` | npm latest is 7.0.2 | Keep the template's `^5`. Don't upgrade to TS 7 |

### Scaffolding: checked by running it in a scratch dir
- `create-next-app` **refuses to run in this repo** because `BUILD_LOOP.md` "could conflict". P1-T1 therefore scaffolds into a temp dir and copies the files in.
- `--yes` adds `cacheComponents: true` and `partialPrefetching: true` to `next.config.ts` unless `--no-cache-components` is passed. We pass it, which keeps the ordinary dynamic-route model.
- The template's `.gitignore` has `.env*`, which would **ignore `.env.example`**. The merged `.gitignore` adds `!.env.example`.
- The template's `@types/node@^20` **conflicts with `vitest@5.1.1`** (peer `^22 || >=24`). npm fails with ERESOLVE. Fix: `@types/node@^22`. With that change, install, `vitest run`, `eslint` and `next build` all passed in scratch.
- The Next 16 `lint` script is plain `eslint` (flat config). `next lint` no longer exists.
- `eslint-config-next` 16 ships `react-hooks` v7, and its rule `react-hooks/set-state-in-effect` **errors** on a synchronous `setState()` inside `useEffect` (verified). Client components must set state only after an `await` or in callbacks.
- Importing `server-only` under Vitest **throws**. Fix: alias it to an empty stub in `vitest.config.mts` (verified).
- In Vitest 5, `resolve.tsconfigPaths: true` resolves `@/…` imports. `.test.tsx` files using `react-dom/server` `renderToStaticMarkup` run in the `node` environment with no extra plugin (both verified).
- Next 15+/16: `params` in pages and route handlers is a **Promise** and must be awaited.

### lightweight-charts 5.3.0: from the installed package's `typings.d.ts` and README
- `chart.addSeries(definition, options?, paneIndex?)`, e.g. `chart.addSeries(CandlestickSeries, {}, 0)`. The typings contain **no** `addCandlestickSeries`.
- `createChart(container, { autoSize, layout: { attributionLogo }, localization: { locale, timeFormatter }, timeScale: { tickMarkFormatter } })` all exist. `tickMarkFormatter(time, tickMarkType, locale)` takes `TickMarkType` = Year 0, Month 1, DayOfMonth 2, Time 3, TimeWithSeconds 4.
- Time type: `UTCTimestamp` (seconds), `BusinessDay` or string.
- `layout.attributionLogo` defaults to `true` and shows a TradingView link on the chart. Licence (README): *"You shall add the 'attribution notice' from the NOTICE file and a link to https://www.tradingview.com/ to the page."* The NOTICE file is **not** in the npm package. Its text on GitHub is `TradingView Lightweight Charts™ / Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/`. The upstream "(с)" uses a Cyrillic "с", so we write a Latin "(c)". We do both: the footer notice (required by the brief) and keep `attributionLogo: true`.

### Twelve Data
`twelvedata.com` and `api.twelvedata.com` are **blocked from this cloud session** (DNS/proxy 403). These facts come from Twelve Data's published OpenAPI document (via the generated client `psyb0t/go-twelvedata` `client.gen.go`), the official `twelvedata-python` client source, and web search.
- `GET https://api.twelvedata.com/time_series`. Params used: `symbol`, `interval` (`1day`), `outputsize` (1–5000; default 30 when no date params, **maximum when `start_date`/`end_date` are set**), `start_date` (`YYYY-MM-DD`, **inclusive**: "returns all records starting from"; for stocks it is read in the exchange's timezone), `order` (`asc`|`desc`, default desc). **We never send `order`.** The docs don't say whether `order=asc` with `outputsize=5000` and no dates returns the newest or the oldest 5000 bars. The default `desc` (newest first) with `outputsize=5000` returns the latest 5000 bars, and we sort ascending locally.
- `timezone` is **ignored for `1day`/`1week`/`1month`**. Daily data always comes back in exchange-local time, and a daily `datetime` is a date such as `2026-11-24`. *This contradicts any idea of asking Twelve Data for UTC daily bars*, so we convert ourselves (see "Time rules").
- Values are **strings** (`"open": "148.73500"`). `volume` may be absent. Response shape: `{ meta: {...}, values: [...], status: "ok" }`.
- Errors: JSON `{ "status": "error", "code": <int>, "message": "..." }`. The official Python client checks **both** the HTTP status and the JSON `code`, because an error can arrive with HTTP 200. Codes in the spec: 400 (bad params), 401 (invalid key), 403 (not on your plan), 404, 414, **429** ("You have run out of API credits for the current minute…"), 500.
- Auth: `Authorization: apikey <key>` header is supported, so the key never appears in the URL.
- Cost: time_series is **1 credit per symbol**, whatever the `outputsize` (Twelve Data docs, via search).
- Basic plan: **800 credits/day, resets at midnight UTC** (OpenAPI `/api_usage` description). **8/min** comes from the brief; I could not re-check it independently because the docs host is blocked.
- *Unverified:* recalled from memory, a request whose range holds no bars returns a 400 "No data is available on the specified dates". The design avoids this case (`start_date` = last cached date, inclusive) and handles it defensively anyway.

### Supabase
- New projects use **publishable** (`sb_publishable_…`, replaces `anon`) and **secret** (`sb_secret_…`, replaces `service_role`) keys. Legacy keys still work where they exist. *The brief says "anon key + service role key"*, so we name env vars `SUPABASE_SECRET_KEY` (either key type works) and, in Phase 2, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Tables are no longer exposed to the Data API automatically.** This became the default for new projects on 30 May 2026 and is enforced on all projects from 30 Oct 2026. The migration must `GRANT` explicitly, otherwise PostgREST returns 42501 (Supabase docs, "Securing your API").
- PostgREST returns at most 1000 rows per request (Supabase default "Max rows"), so reads must paginate.
- The draft migration below was **run on local PostgreSQL 16** with stubbed Supabase roles and `auth.uid()`:
  - It applies cleanly.
  - `service_role` can insert into an identity column without a sequence grant.
  - The partial unique index blocks a second `pending` lease.
  - `anon` gets "permission denied" on `candles`.
  - RLS blocks a user inserting a row for another user.
  - `UNIQUE NULLS NOT DISTINCT` rejects a second default (`symbol IS NULL`) pref.
- `supabase-js` 2.119.2 accepts `global.fetch` (used to unit-test the store). A hand-written `Database` type in `supabase gen types` format type-checks with select, insert and upsert (verified with `tsc`).

### Things that differ from the brief (none block the plan)
1. Supabase key names (above).
2. The brief says "fetch only candles newer than the last cached one". We send `start_date = <last cached date>` (inclusive), which returns the last cached bar plus newer ones. The cost is the same (1 credit). The response is never empty, and a revised last bar gets corrected.
3. The brief's "Before you start" steps have not been done. P1-T1 does the scaffold. Supabase, the Twelve Data key and the Vercel link need Tom (see P1-T9 and Open questions).

---

## Phase 1 – Chart for one ticker: acceptance criteria (from the brief)
- [ ] `/chart/[symbol]` shows daily candles for a US ticker, e.g. AAPL
- [ ] Data comes from Supabase. If the cache is empty or stale, the API route fetches from Twelve Data and stores it
- [ ] A second load of the same ticker makes zero API calls (check `fetch_log`)
- [ ] Attribution notice is in the footer

Plus the definition of done: `npm run build`, `npm run lint` and `npm test` pass; proof recorded; `PROGRESS.md` updated; no secrets; `.env.example` current.

| Criterion | Covered by | Provable without keys? |
|---|---|---|
| Chart page shows daily candles | P1-T8 (UI), P1-T7 (route), P1-T9 (live) | Build, unit tests and v5-API grep: yes. **Real chart screenshot: needs keys** |
| Cache first; fetch and store when empty or stale | P1-T3 (stale rule), P1-T5 (store), P1-T6 (service) | Yes (service tests with in-memory store and fake provider). **Live proof: needs keys** |
| Second load = zero API calls | P1-T6 tests (provider call count = 0), P1-T9 (`fetch_log` count) | Unit proof: yes. **`fetch_log` proof: needs keys** |
| Attribution in footer | P1-T8 | Yes (render test plus build) |

---

## Key design decisions

### Architecture
```
Browser ──GET /api/candles/AAPL──► app/api/candles/[symbol]/route.ts   (only place the browser talks to)
                                        │
                                        ▼
                         lib/candles/get-chart-candles.ts  (cache-first service: freshness, budget guard, lease)
                           │                         │
                           ▼                         ▼
           lib/cache/supabase-candle-store.ts   lib/data-provider/twelve-data.ts  (server-only; key from env)
                 (candles, fetch_log)                 implements DataProvider.getCandles(symbol, interval, from?)
```
- `/chart/[symbol]` is a server page that validates the symbol and renders a client `ChartView`. `ChartView` calls `/api/candles/[symbol]` and draws with lightweight-charts. The browser never sees the Twelve Data key or URL.
- Every module that touches secrets starts with `import "server-only"`. Env vars are read lazily at request time (never at module top level), so `next build` passes without keys.

### Time rules (UTC storage, Pacific/Auckland display)
- **Storage:** a daily bar for US trading date `D` (as returned by Twelve Data) is stored as `ts = D 00:00:00Z` (`timestamptz`). A daily bar's identity is its date, and midnight UTC is lightweight-charts' convention for daily data.
- **Display:** the chart gets `time = ts` in UTC seconds. All labels are formatted with `Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland' })`. NZ is always ahead of UTC (+12/+13), so `D 00:00Z` always shows as date `D` in NZ. For example, AAPL's 24 Nov bar is labelled "24 Nov 2026", not shifted. Intraday intervals (Phase 4) will use the same formatters, with times.

### "Stale" rule for daily candles (lib/time/market-calendar.ts)
- **Close cutoff:** 18:00 America/New_York on a weekday. This leaves a buffer after the 16:00 close so the provider's daily bar is final. DST is handled through `Intl`, so no hard-coded offsets.
- **Expected latest daily candle** at instant `now`:
  1. Take NY-local date `d` of `now`.
  2. If NY-local time is before 18:00, use the previous calendar day.
  3. While `d` is Saturday or Sunday, step back one day.
  4. The result is the expected date `E`.
- **Cache is fresh** when it holds at least one candle AND either:
  - (a) the latest cached date ≥ `E`, or
  - (b) the last `fetch_log` row with `status='ok'` for this symbol/interval has `created_at ≥ cutoffInstant(E)`.

  Clause (b) covers US holidays and other days with no new bar: once we have fetched after the cutoff and got nothing newer, we don't fetch again until the next cutoff. No holiday calendar is needed.
- **Only completed bars are stored:** when storing, drop any candle whose date is after `E` (computed at fetch time). For example, Twelve Data's in-progress bar during the US session is never cached, so a cached bar is never partial.
- **NZ example:** at 09:00 NZDT Thursday (= 15:00 ET Wednesday), `E` = Tuesday. Wednesday's bar becomes expected after 18:00 ET Wednesday (12:00 NZDT Thursday).
- **Known limitation:** if Twelve Data publishes a bar late (after 18:00 ET), clause (b) can hide that bar until the next day's cutoff. This is acceptable for personal use.

### Credit protection and concurrency
- **Order of operations on a load:**
  1. In-process de-dupe (same instance, same series: share one promise).
  2. Freshness check (0 credits; stop here if fresh).
  3. Local budget guard.
  4. DB lease.
  5. Provider call (1 credit).
  6. Upsert.
  7. Close the lease row.
- **Local budget guard** reads `fetch_log`:
  - If the sum of `credits_used` over the last 60 s is ≥ 8, it refuses without calling Twelve Data.
  - If the sum since the latest UTC midnight is ≥ 800, it refuses likewise.
  - On refusal, it serves the cache (if any) with a notice, otherwise returns a 429 with a clear message.
- **Lease (prevents double-spend across serverless instances):** before calling, insert a `fetch_log` row with `status='pending', credits_used=1`.
  - The partial unique index `(symbol, interval) WHERE status='pending'` makes a second concurrent insert fail with `23505`. That request does **not** call Twelve Data: it serves stale cache with a "refreshing" notice, or returns 503 `busy` with `Retry-After: 3` if the cache is empty.
  - Pending rows older than 60 s are marked `expired` before inserting, so a crashed request can't lock a ticker.
  - The same row is updated to its final status. Result: exactly one `fetch_log` row per Twelve Data call.
- **In-process de-dupe:** a module-level `Map<key, Promise>` makes concurrent requests on the same server instance await one refresh instead of getting `busy`.
- **Credit accounting:** every request that reaches Twelve Data is logged as 1 credit, including 429/4xx responses. This is conservative: we don't know whether Twelve Data charges rejected calls. Requests stopped by the local guard or the lease never reach Twelve Data and are not logged.

### Schema: create all four tables now (with RLS)
- **Recommendation: yes.** The brief requires Tom's approval for schema changes after Phase 1. `watchlist` and `indicator_prefs` are already specified in the brief's data model, and Phases 2 and 3 need them, so creating them now avoids two stop-and-ask pauses.
- They are inert in Phase 1: RLS is on, there are owner-only policies, and nothing reads or writes them yet.
- The `candles.interval` CHECK already allows `1h`, `1day`, `1week` and `1month`, so Phase 4 doesn't need a schema change either.
- Phase 5 (alerts) needs approval anyway because it's optional.
- `candles` and `fetch_log` are not user data, but they also get RLS with **no** policies, and grants go to `service_role` only. That makes them unreachable with browser keys. Only the server, using the secret key (which bypasses RLS), touches them.

---

## Tasks

Conventions for all tasks:
- File names use kebab-case and imports use `@/`.
- No `any`.
- Every test file lives next to its source (`*.test.ts(x)`) unless noted.
- Fixture data is synthetic and labelled `// synthetic test data, not real prices`.

### P1-T1 – Scaffold Next.js 16 app, Vitest and repo hygiene
**Files:**
- Create: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `AGENTS.md`, `README.md`, `vitest.config.mts`, `test/stubs/server-only.ts`, `test/env-example.test.ts`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`, `PROGRESS.md`
- Change: `.gitignore`

**Steps:**
1. `TMP=$(mktemp -d) && cd "$TMP" && npx -y create-next-app@16.4.6 web --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-npm --skip-install --disable-git --no-react-compiler --no-cache-components --no-agent-feedback --yes`
2. Copy into the repo root: `cp -r "$TMP/web/app" "$TMP/web/AGENTS.md" "$TMP/web/README.md" "$TMP/web/eslint.config.mjs" "$TMP/web/next.config.ts" "$TMP/web/package.json" "$TMP/web/tsconfig.json" /home/user/Market-Charter/`. Don't copy `public/`, `next-env.d.ts` (generated, ignored) or the template `.gitignore`. Then delete `app/page.module.css`.
3. `package.json`:
   - set `"name": "market-charter"`
   - set scripts to exactly `"dev": "next dev"`, `"build": "next build"`, `"start": "next start"`, `"lint": "eslint"`, `"test": "vitest run"`, `"test:watch": "vitest"`.
4. Install, in this order:
   1. `npm install`
   2. `npm install -D @types/node@^22`
   3. `npm install -D --save-exact vitest@5.1.1`
   4. `npm install --save-exact lightweight-charts@5.3.0 @supabase/supabase-js@2.119.2 server-only@0.0.1`

   Do not install `technicalindicators` or `@supabase/ssr`.
5. `vitest.config.mts` (exact; verified working):
   ```ts
   import { fileURLToPath } from "node:url";
   import { defineConfig } from "vitest/config";

   export default defineConfig({
     resolve: {
       tsconfigPaths: true,
       alias: { "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)) },
     },
     test: {
       environment: "node",
       include: ["**/*.test.ts", "**/*.test.tsx"],
       exclude: ["node_modules/**", ".next/**"],
     },
   });
   ```
   `test/stubs/server-only.ts` contains `export {};` plus a one-line comment explaining why it exists.
6. `.gitignore`: replace with the union of the old file and the template, plus the `.env.example` exception:
   ```
   node_modules/
   .pnp
   .pnp.*
   .next/
   out/
   build/
   coverage/
   .DS_Store
   *.pem
   npm-debug.log*
   .env
   .env*.local
   .env.*
   !.env.example
   .vercel
   *.tsbuildinfo
   next-env.d.ts
   ```
7. `.env.example` (exact):
   ```
   # Copy to .env.local and fill in. Never commit real values.
   # Twelve Data API key. Server only.
   TWELVE_DATA_API_KEY=
   # Supabase project URL (Project Settings > API). Not secret.
   NEXT_PUBLIC_SUPABASE_URL=
   # Supabase secret key (sb_secret_...) or legacy service_role key. Server only; bypasses RLS.
   SUPABASE_SECRET_KEY=
   ```
8. `test/env-example.test.ts`: reads `.env.example` and asserts:
   - (a) the keys `TWELVE_DATA_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present;
   - (b) every `KEY=value` line has an empty value;
   - (c) no key except `NEXT_PUBLIC_SUPABASE_URL` starts with `NEXT_PUBLIC_`.
9. `app/layout.tsx`:
   - remove `next/font/google` and the Geist fonts (avoids a build-time network fetch);
   - `metadata = { title: "Market Charter", description: "Personal market charts" }`;
   - `<html lang="en-NZ"><body><main>{children}</main></body></html>`;
   - keep the `LayoutProps<"/">` typing from the template, or use `{ children: React.ReactNode }`.
10. `app/page.tsx`: `<h1>Market Charter</h1>`, one sentence, and `<Link href="/chart/AAPL">Open AAPL chart</Link>`.
11. `app/globals.css`: replace with a minimal system-font stylesheet:
    - box-sizing reset;
    - `body { margin:0; font-family: system-ui, sans-serif; }`;
    - `main { max-width: 1100px; margin: 0 auto; padding: 16px; }`;
    - `.notice { padding: 8px 12px; border-radius: 6px; background:#fff7e0; border:1px solid #e6c200; }`;
    - `.error { … background:#fdecec; border:1px solid #e57373; }`;
    - `footer { … font-size: 13px; color:#555; }`.
12. `README.md`: replace with a project summary, scripts (`dev`, `build`, `lint`, `test`) and "Environment" (copy `.env.example` to `.env.local`). Leave a `## Database setup` heading with "See P1-T2" (T2 fills it).
13. Keep `AGENTS.md` as generated. `next dev` re-adds it anyway.
14. Create `PROGRESS.md` with a Phase 1 header and a T1 entry.

**Done when:**
- `npm run build`, `npm run lint` and `npm test` all pass. `npm test` runs `test/env-example.test.ts`.
- `next.config.ts` has no `cacheComponents`. `grep -r "next/font/google" app` returns nothing.
- `git check-ignore -q .env.example` exits 1 (not ignored). `git check-ignore -q .env.local` exits 0.
- `package.json` has the exact versions listed above and no `technicalindicators` or `@supabase/ssr`.

**Risks:**
- Running `create-next-app` in the repo root fails (BUILD_LOOP.md conflict), so always use the temp-dir route.
- Without the `.gitignore` exception, `.env.example` would silently never be committed.
- Don't edit BUILD_LOOP.md.

### P1-T2 – Supabase schema migration, DB types, env and admin client
**Files:**
- Create: `supabase/migrations/20261125000000_initial_schema.sql`, `lib/supabase/database.types.ts`, `lib/env.ts`, `lib/env.test.ts`, `lib/supabase/admin.ts`
- Change: `README.md`

**Steps:**
1. Migration (exact SQL; validated on PG16):
   ```sql
   -- Phase 1 schema. All four tables from the brief, created now to avoid post-Phase-1 schema changes.
   create table public.candles (
     symbol     text        not null,
     "interval" text        not null,
     ts         timestamptz not null,
     open       numeric     not null,
     high       numeric     not null,
     low        numeric     not null,
     close      numeric     not null,
     volume     bigint,
     primary key (symbol, "interval", ts),
     constraint candles_symbol_upper check (symbol = upper(symbol)),
     constraint candles_interval_valid check ("interval" in ('1h', '1day', '1week', '1month'))
   );

   create table public.fetch_log (
     id               bigint      generated always as identity primary key,
     symbol           text        not null,
     "interval"       text        not null,
     credits_used     integer     not null default 0 check (credits_used >= 0),
     status           text        not null check (status in ('pending', 'ok', 'rate_limited', 'not_found', 'error', 'expired')),
     candles_received integer,
     message          text,
     created_at       timestamptz not null default now(),
     completed_at     timestamptz
   );
   create index fetch_log_series_created_idx on public.fetch_log (symbol, "interval", created_at desc);
   create index fetch_log_created_idx on public.fetch_log (created_at desc);
   -- Lease: at most one in-flight Twelve Data call per series.
   create unique index fetch_log_one_pending_per_series on public.fetch_log (symbol, "interval") where status = 'pending';

   create table public.watchlist (
     id         uuid        primary key default gen_random_uuid(),
     user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
     symbol     text        not null check (symbol = upper(symbol)),
     sort_order integer     not null default 0,
     created_at timestamptz not null default now(),
     unique (user_id, symbol)
   );

   create table public.indicator_prefs (
     id         uuid        primary key default gen_random_uuid(),
     user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
     symbol     text        check (symbol is null or symbol = upper(symbol)), -- null = default config
     config     jsonb       not null default '{}'::jsonb,
     updated_at timestamptz not null default now(),
     constraint indicator_prefs_user_symbol_key unique nulls not distinct (user_id, symbol)
   );

   alter table public.candles         enable row level security;
   alter table public.fetch_log       enable row level security;
   alter table public.watchlist       enable row level security;
   alter table public.indicator_prefs enable row level security;

   -- Supabase no longer auto-exposes new tables to the Data API: grant explicitly.
   revoke all on public.candles, public.fetch_log, public.watchlist, public.indicator_prefs from anon, authenticated;
   grant select, insert, update, delete on public.candles, public.fetch_log to service_role;
   grant select, insert, update, delete on public.watchlist, public.indicator_prefs to authenticated, service_role;

   create policy "watchlist_owner_all" on public.watchlist for all to authenticated
     using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
   create policy "indicator_prefs_owner_all" on public.indicator_prefs for all to authenticated
     using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
   ```
2. `lib/supabase/database.types.ts`: hand-write in `supabase gen types typescript` format. Export `Json` and `Database`, where `public.Tables` has `candles`, `fetch_log`, `watchlist` and `indicator_prefs`, each with `Row`, `Insert`, `Update` and `Relationships: []`. `Views`, `Functions`, `Enums` and `CompositeTypes` are `{ [_ in never]: never }`. Type mapping:
   - `numeric`/`integer`/`bigint` → `number`
   - `timestamptz`/`uuid`/`text` → `string`
   - `jsonb` → `Json`
   - nullable columns → `| null`
   - identity `id` → `id?: never` in Insert/Update
   - defaulted columns are optional in Insert

   This shape was verified to type-check with supabase-js 2.119.2. Add a header comment: "Hand-written to match supabase/migrations; regenerate with `supabase gen types` once the project is linked."
3. `lib/env.ts`:
   - Starts with `import "server-only"`.
   - Exports `class ConfigError extends Error { readonly missing: string[] }`.
   - `getTwelveDataApiKey(): string` reads `TWELVE_DATA_API_KEY`.
   - `getSupabaseAdminConfig(): { url: string; secretKey: string }` reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
   - Both trim the value, treat empty as missing, and throw `ConfigError` listing the missing **names** only (never values).
4. `lib/supabase/admin.ts`:
   - Starts with `import "server-only"`.
   - `createSupabaseAdminClient(): SupabaseClient<Database>` returns `createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`.
   - Optional parameter `options?: { fetch?: typeof fetch }`, passed as `global: { fetch }` (used by store tests).
   - No module-level client and no env reads at import time.
5. `lib/env.test.ts`: use `vi.stubEnv` to test:
   - missing → `ConfigError` with exact `missing` names;
   - whitespace-only counts as missing;
   - present → values returned;
   - the error message doesn't contain any stubbed value.
6. `README.md` "Database setup":
   - (a) create a Supabase project;
   - (b) paste `supabase/migrations/20261125000000_initial_schema.sql` into the SQL Editor and run it, or run `supabase db push` if the CLI is linked;
   - (c) copy the Project URL and a **secret** key into `.env.local`.
7. **Local validation (not committed):** run the migration against throwaway local PostgreSQL 16. The binaries are at `/usr/lib/postgresql/16/bin`; the OS user is `postgres`.
   ```bash
   PGT=$(mktemp -d /tmp/mc-pg.XXXX) && chown postgres "$PGT"
   su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGT/data -A trust >/dev/null && /usr/lib/postgresql/16/bin/pg_ctl -D $PGT/data -o '-p 54329 -k $PGT' -l $PGT/log start"
   P="psql -h $PGT -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
   $P <<'SQL'
   create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema auth; create table auth.users (id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
   grant usage on schema auth to anon, authenticated, service_role; grant execute on function auth.uid() to anon, authenticated, service_role;
   grant usage on schema public to anon, authenticated, service_role;
   SQL
   $P -f supabase/migrations/20261125000000_initial_schema.sql && echo MIGRATION_OK
   ```
   Then run these checks. Each one must show the expected result:
   - As `set role service_role`: insert one pending fetch_log row for AAPL/1day → succeeds. Insert a second → `duplicate key … fetch_log_one_pending_per_series`.
   - As `set role anon`: `select * from candles` → `permission denied`.
   - `select relname, relrowsecurity from pg_class where relname in ('candles','fetch_log','watchlist','indicator_prefs')` → 4 rows, all `t`.
   - Insert two `auth.users` rows. As `authenticated` with `request.jwt.claim.sub` = user 2, insert a watchlist row with `user_id` = user 1 → `new row violates row-level security policy`.

   Stop the server with `su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGT/data stop"`, then `rm -rf "$PGT"`. Paste the outputs into PROGRESS.md.

**Done when:**
- build, lint and test pass;
- `lib/env.test.ts` passes;
- the local PG validation output (MIGRATION_OK plus the 4 expected results) is in PROGRESS.md;
- `grep -rn "process.env" lib app --include=*.ts --include=*.tsx | grep -v "lib/env.ts" | grep -v "\.test\.tsx\?:"` returns nothing. This applies to non-test source only: opt-in integration tests such as T5's may read `process.env`.

**Risks:**
- Missing GRANTs means 42501 errors on real Supabase, so keep the grant block.
- `interval` is a SQL keyword. It is quoted in the SQL, and PostgREST and supabase-js accept it as a plain column name.
- The secret key bypasses RLS. It must only ever be imported from `server-only` modules.

### P1-T3 – Market calendar, NZ display formatters, symbol validation
**Files:** `lib/time/market-calendar.ts` (+ `.test.ts`), `lib/time/display.ts` (+ `.test.ts`), `lib/symbol.ts` (+ `.test.ts`)

**Steps:**
1. `lib/time/market-calendar.ts` (pure, no imports from app code):
   - `export const MARKET_TIME_ZONE = "America/New_York"`, `DAILY_CLOSE_CUTOFF = { hour: 18, minute: 0 }`.
   - `zonedParts(instant: Date, timeZone: string): { year; month; day; hour; minute; weekday }` via `Intl.DateTimeFormat("en-US", { timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23", weekday:"short" }).formatToParts`. Numbers are parsed from parts, and `weekday` is 0–6 with Sun = 0.
   - `zonedDateTimeToUtc(date: string /*YYYY-MM-DD*/, hour: number, minute: number, timeZone: string): Date`:
     1. `guess = Date.UTC(y, m-1, d, hour, minute)`
     2. `off1 = offsetMs(guess)`, where `offsetMs(t) = Date.UTC(...zonedParts(new Date(t), tz)) - t`
     3. `result = guess - off1`
     4. if `offsetMs(result) !== off1`, use `guess - offsetMs(result)`
   - `addDays(date: string, n: number): string` (UTC date arithmetic) and `dayOfWeek(date: string): number`.
   - `expectedLatestDailyCandleDate(now: Date): string`: the rule in "Stale rule" above.
   - `dailyCutoffInstant(date: string): Date` = `zonedDateTimeToUtc(date, 18, 0, MARKET_TIME_ZONE)`.
   - `isDailyCacheFresh(args: { latestCachedTs: string | null; lastOkFetchAt: Date | null; now: Date }): boolean`: the rule above. `latestCachedTs` is ISO, compared via its first 10 chars.
   - `dateToDailyTs(date: string): string` → `${date}T00:00:00.000Z`. `dailyTsToDate(ts: string): string` → `new Date(ts).toISOString().slice(0, 10)`, which accepts `+00:00` forms from Postgres.
2. `lib/time/market-calendar.test.ts`. Use exact instants, all real 2026 calendar dates:
   - Wed 2026-11-25T17:00Z (12:00 ET) → `2026-11-24`
   - Wed 2026-11-25T23:00Z (18:00 ET exactly) → `2026-11-25`
   - Wed 2026-11-25T22:59Z → `2026-11-24`
   - Sat 2026-11-28T15:00Z → `2026-11-27`
   - Sun 2026-11-29T23:30Z → `2026-11-27`
   - Mon 2026-11-30T14:00Z (09:00 ET) → `2026-11-27`
   - NZ morning: 2026-11-25T20:00Z (= 09:00 NZDT Thu 26 Nov, 15:00 ET Wed) → `2026-11-24`
   - `dailyCutoffInstant("2026-10-30")` → `2026-10-30T22:00:00.000Z` (EDT); `("2026-11-02")` → `2026-11-02T23:00:00.000Z` (EST); `("2026-03-06")` → `23:00Z`; `("2026-03-09")` → `22:00Z` (DST starts 8 Mar 2026)
   - `isDailyCacheFresh`:
     - null cache → false
     - latest = expected → true
     - latest older and `lastOkFetchAt` null → false
     - Thanksgiving: now 2026-11-27T01:00Z (Thu 26 Nov 20:00 ET), latest `2026-11-25`, `lastOkFetchAt` 2026-11-26T23:30Z → true; with `lastOkFetchAt` 2026-11-26T22:00Z → false
   - `dailyTsToDate("2026-11-24T00:00:00+00:00")` → `2026-11-24`
3. `lib/time/display.ts`: `DISPLAY_TIME_ZONE = "Pacific/Auckland"`, `DISPLAY_LOCALE = "en-NZ"`.
   - `formatNzDate(utcSeconds)`: `{day:"numeric", month:"short", year:"numeric"}` → "24 Nov 2026".
   - `formatNzDateTime(utcSeconds)`: adds `hour:"2-digit", minute:"2-digit", hourCycle:"h23"` → "25 Nov 2026, 09:00".
   - `nzTickMarkLabel(utcSeconds, tickMarkType: 0|1|2|3|4)`: Year → "2026", Month → "Nov", DayOfMonth → "24", Time/TimeWithSeconds → "09:00".

   Pure, so no lightweight-charts import here; numeric tick types are mapped in T8.
4. `lib/time/display.test.ts`:
   - `formatNzDate(Date.UTC(2026,10,24)/1000)` → `"24 Nov 2026"`
   - `formatNzDateTime(Date.parse("2026-11-24T20:00:00Z")/1000)` → `"25 Nov 2026, 09:00"`
   - the tick labels for each type

   If ICU spacing ever differs, compare after `.replace(/\s/g," ")`.
5. `lib/symbol.ts`: `normaliseSymbol(raw: string): string | null`. Trim, uppercase, accept `/^[A-Z][A-Z0-9.-]{0,9}$/`, otherwise null.
6. `lib/symbol.test.ts`:
   - `aapl` → `AAPL`; ` brk.b ` → `BRK.B`; `BF-B` → `BF-B`
   - `""`, `1ABC`, `AAPL;DROP`, `A/B` and an 11-char symbol → null

**Done when:** all the listed tests pass, and build and lint pass.

**Risks:**
- DST mistakes, which are covered by the March and November cases.
- Never hard-code −4/−5 offsets.
- Don't use `toLocaleString` round-trips via `new Date(string)` parsing; only `formatToParts`.

### P1-T4 – Data provider interface + Twelve Data implementation
**Files:**
- `lib/data-provider/types.ts`
- `lib/data-provider/twelve-data.ts` (+ `twelve-data.test.ts`)
- `lib/data-provider/index.ts`
- `test/fixtures/twelve-data-time-series-1day.json`

**Steps:**
1. `types.ts` (no `server-only`; types are importable anywhere):
   ```ts
   export type Interval = "1day";
   export const SUPPORTED_INTERVALS: readonly Interval[] = ["1day"];
   export interface Candle { ts: string; open: number; high: number; low: number; close: number; volume: number | null } // ts = ISO UTC
   export interface DataProvider {
     readonly name: string;
     /** Candles ascending by ts. `from` = 'YYYY-MM-DD', inclusive, exchange-local date. Omitted = full history backfill. */
     getCandles(symbol: string, interval: Interval, from?: string): Promise<Candle[]>;
   }
   export type ProviderErrorKind = "rate_limited" | "not_found" | "forbidden" | "auth" | "unavailable" | "bad_response";
   export class ProviderError extends Error {
     constructor(readonly kind: ProviderErrorKind, message: string, readonly httpStatus: number | null = null) { super(message); this.name = "ProviderError"; }
   }
   ```
2. `twelve-data.ts` (`import "server-only"`):
   - `class TwelveDataProvider implements DataProvider`, `name = "twelve-data"`.
   - Constructor `{ apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string /* default "https://api.twelvedata.com" */; timeoutMs?: number /* default 10000 */ }`.
   - Exported constant `INITIAL_OUTPUTSIZE = 5000`.
   - Request:
     - `GET ${baseUrl}/time_series?symbol=…&interval=1day` + (`from` ? `&start_date=${from}` : `&outputsize=5000`), built with `URLSearchParams`. **Do not send `order`.** Twelve Data's default `desc` returns the newest bars first, so the initial backfill gets the *latest* 5000 bars, not the oldest; step (d) sorts ascending locally;
     - header `Authorization: apikey ${apiKey}`; **never** put the key in the URL;
     - `cache: "no-store"`, `signal: AbortSignal.timeout(timeoutMs)`.
   - Response mapping:
     - (a) a fetch rejection or timeout → `unavailable`.
     - (b) Non-JSON body → `bad_response`, unless HTTP ≥ 500, which is `unavailable`.
     - (c) Error code = `json.status === "error" ? json.code : res.ok ? null : res.status`.
       - 429 → `rate_limited`
       - 401 → `auth`
       - 403 → `forbidden`
       - 404 → `not_found`
       - 400: if message matches `/no data is available/i` → return `[]`; if it matches `/symbol/i` (e.g. "**symbol** not found: XYZ") → `not_found`; else `bad_response`
       - ≥ 500 → `unavailable`
       - anything else → `bad_response`
     - (d) `status === "ok"` and `values` an array: map each value:
       - `date = datetime.slice(0,10)`, which must match `/^\d{4}-\d{2}-\d{2}$/`;
       - `ts = dateToDailyTs(date)`;
       - OHLC via `Number()`, which must be finite;
       - `volume = values.volume === undefined ? null : Number(volume)`;
       - any invalid value → `bad_response`;
       - sort ascending by ts and de-dupe by ts.
     - (e) `ProviderError` messages contain Twelve Data's message but never the URL or the key.
3. `index.ts` (`import "server-only"`): `export function getDataProvider(): DataProvider { return new TwelveDataProvider({ apiKey: getTwelveDataApiKey() }); }`. This is the single switch point when the provider changes.
4. Fixture: 6 synthetic daily values for 2026-11-17 … 2026-11-24 (weekdays), **listed newest first** (Twelve Data's default `desc` order, which also exercises the local sort), with string prices, the 3rd value without `volume`, and a `meta` block (`symbol: "TEST"`, `exchange_timezone: "America/New_York"`).
5. `twelve-data.test.ts`, with a fake `fetchImpl` that records calls:
   - success maps the fixture (count, first/last ts, numbers, `volume: null`);
   - URL has `outputsize=5000` and no `start_date` when `from` is omitted, and `start_date=2026-11-20` and no `outputsize` when given;
   - **URL assertion: in both cases `new URL(url).searchParams.has("order")` is `false`**, and the parsed params are exactly `{symbol, interval, outputsize}` or `{symbol, interval, start_date}` (no others);
   - the newest-first fixture comes back sorted ascending (first ts `2026-11-17…`, last `2026-11-24…`);
   - 400 `"Invalid **interval** provided"` → `bad_response` (not `not_found`);
   - `Authorization` header is `apikey test-key`, and `"test-key"` is not in the URL;
   - HTTP 429 → `rate_limited`;
   - **HTTP 200 with `{status:"error",code:429}` → `rate_limited`**;
   - 401 → `auth`; 403 → `forbidden`;
   - 400 "**symbol** not found" → `not_found`;
   - 400 "No data is available on the specified dates" → `[]`;
   - 500 → `unavailable`; fetch throws → `unavailable`;
   - a garbage value (`"open":"abc"`) → `bad_response`.

**Done when:**
- the tests pass, with 0 real network calls (the fake fetch asserts the host);
- build and lint pass;
- `grep -rn "twelvedata" app components` returns nothing.

**Risks:**
- Error-in-HTTP-200 is easy to miss, so it is covered by a test.
- Never log full request URLs or headers.
- The provider must stay the only file that knows Twelve Data's URL or shapes.

### P1-T5 – Candle store: interface, Supabase implementation, in-memory test double
**Files:**
- `lib/cache/candle-store.ts`
- `lib/cache/supabase-candle-store.ts` (+ `supabase-candle-store.test.ts`, `supabase-candle-store.integration.test.ts`)
- `test/helpers/memory-candle-store.ts`
- `test/helpers/candle-store-contract.ts`
- `test/memory-candle-store.test.ts`

**Steps:**
1. `candle-store.ts` (types only, no `server-only`):
   ```ts
   export type FetchFinalStatus = "ok" | "rate_limited" | "not_found" | "error";
   export interface FetchCompletion { status: FetchFinalStatus; creditsUsed: number; candlesReceived: number | null; message: string | null }
   export interface CandleStore {
     getCandles(symbol: string, interval: Interval): Promise<Candle[]>;              // ascending, all rows
     getLatestCandleTs(symbol: string, interval: Interval): Promise<string | null>;  // ISO UTC
     upsertCandles(symbol: string, interval: Interval, candles: Candle[]): Promise<void>;
     getLastOkFetchAt(symbol: string, interval: Interval): Promise<Date | null>;     // created_at of latest status='ok'
     sumCreditsSince(since: Date): Promise<number>;                                  // all symbols
     acquireFetchLease(symbol: string, interval: Interval, now: Date): Promise<number | null>; // fetch_log id, or null if another pending lease exists
     completeFetchLease(id: number, completion: FetchCompletion, now: Date): Promise<void>;
   }
   export class StoreError extends Error { constructor(message: string, readonly cause?: unknown) { super(message); this.name = "StoreError"; } }
   export const LEASE_TTL_MS = 60_000;
   ```
2. `supabase-candle-store.ts` (`import "server-only"`): `createSupabaseCandleStore(client: SupabaseClient<Database>): CandleStore`.
   - `getCandles`: `select("ts,open,high,low,close,volume").eq("symbol").eq("interval").order("ts",{ascending:true}).range(offset, offset+999)`. Loop with page size 1000 until a page has < 1000 rows (safety cap 50 pages). Map with `new Date(ts).toISOString()` and `Number()` for numerics, keeping a null `volume`.
   - `getLatestCandleTs`: order desc, `.limit(1).maybeSingle()`.
   - `upsertCandles`: no-op for `[]`. Rows `{symbol, interval, ts, open, high, low, close, volume}` in chunks of 1000 with `.upsert(chunk, { onConflict: "symbol,interval,ts" })`.
   - `getLastOkFetchAt`: `fetch_log` with `status = ok`, order `created_at` desc, limit 1.
   - `sumCreditsSince`: `select("credits_used").gte("created_at", since.toISOString()).gt("credits_used", 0)`, summed in JS. Paginate like `getCandles`, although rows/day are bounded by about 800.
   - `acquireFetchLease`:
     1. `update({ status:"expired", completed_at: now, message:"lease expired" }).eq("symbol").eq("interval").eq("status","pending").lt("created_at", new Date(now - LEASE_TTL_MS).toISOString())`;
     2. `insert({ symbol, interval, status:"pending", credits_used:1, created_at: now.toISOString() }).select("id").single()`. Pass `created_at` explicitly so every time comparison uses the app's injected clock: it keeps tests deterministic and the contract test's "acquire at now − 61 s" works against real Supabase;
     3. if `error.code === "23505"` → return `null`.
   - `completeFetchLease`: `update({ status, credits_used, candles_received, message, completed_at: now }).eq("id", id)`.
   - Any other `error` from supabase-js → throw `StoreError` with a message like `"Supabase getCandles failed: <error.message>"`, never including keys.
3. `test/helpers/memory-candle-store.ts`: `class MemoryCandleStore implements CandleStore`, the same semantics in memory: one pending lease per series, expiry after `LEASE_TTL_MS`, `created_at` taken from the `now` passed in. Test-only helpers:
   - `logRows()` returns a copy of fetch_log rows;
   - `seedCandles()`;
   - `seedLog(row)`;
   - `failNext(method)` makes the next call throw `StoreError`.
4. `test/helpers/candle-store-contract.ts`: `runCandleStoreContract(name, makeStore: () => Promise<{ store: CandleStore; cleanup(): Promise<void> }>, symbolPrefix: string)`. Shared `describe` blocks cover:
   - upsert then get round-trip, including ordering and null volume;
   - upsert overwrites the same ts;
   - latest ts;
   - lease acquire → second acquire null → complete → acquire again works;
   - a stale pending row (seeded via acquire at `now - 61s`) is expired by the next acquire;
   - `getLastOkFetchAt` only counts `ok`;
   - `sumCreditsSince` boundaries.

   Use symbols starting with `symbolPrefix`.
5. `test/memory-candle-store.test.ts` runs the contract against `MemoryCandleStore` (prefix `ZZTEST`).
6. `supabase-candle-store.test.ts` (no network) uses `createSupabaseAdminClient`-style `createClient<Database>("https://example.supabase.co", "test-secret", { global: { fetch: fakeFetch } })` with a fake fetch that returns canned PostgREST responses:
   - (a) `getCandles` makes 2 requests when the first page returns 1000 rows and the second 5, giving 1005 candles with numbers (not strings) and ISO `ts`;
   - (b) `upsertCandles` with 2500 rows makes 3 POSTs whose URL contains `on_conflict=symbol%2Cinterval%2Cts` (or the unencoded form);
   - (c) lease insert answered `409 {"code":"23505", ...}` → `acquireFetchLease` returns `null`;
   - (d) `500 {"message":"boom"}` → `StoreError`;
   - (e) no request URL or body contains `"test-secret"` (it is only in headers).
7. `supabase-candle-store.integration.test.ts`: `describe.skipIf(!(process.env.RUN_SUPABASE_TESTS === "1" && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY))`. Runs the contract against the real project with prefix `ZZTEST`. `cleanup` deletes **only** rows `where symbol like 'ZZTEST%'` from `candles` and `fetch_log`. This is the plan's only delete, and it touches test rows only. Vitest doesn't load `.env.local`, so document that the test runs with env exported, for example `set -a; . ./.env.local; set +a; RUN_SUPABASE_TESTS=1 npm test`.

**Done when:**
- the contract passes on the memory store;
- fake-fetch tests (a)–(e) pass;
- the integration test is reported as **skipped** in a normal `npm test`;
- build and lint pass.

**Needs keys:** the integration contract against real Supabase (run in P1-T9).

**Risks:**
- The 1000-row cap silently truncates history without pagination, so it is covered by test (a).
- A wrong `onConflict` string gives duplicate-key errors.
- The secret key bypasses RLS, so this module is server-only.

### P1-T6 – Cache-first candle service (freshness, budget guard, lease, de-dupe)
**Files:**
- `lib/candles/api-types.ts`
- `lib/candles/limits.ts`
- `lib/candles/get-chart-candles.ts` (+ `get-chart-candles.test.ts`)
- `test/helpers/fake-provider.ts`

**Steps:**
1. `api-types.ts` (types only, shared by route and client):
   ```ts
   export interface ApiCandle { time: number; open: number; high: number; low: number; close: number; volume: number | null } // time = UTC seconds
   export type NoticeCode = "rate_limited" | "busy" | "provider_unavailable" | "provider_error";
   export interface Notice { code: NoticeCode; message: string }
   export type ErrorCode = "invalid_symbol" | "invalid_interval" | "not_found" | "forbidden" | "rate_limited" | "busy" | "provider_unavailable" | "provider_error" | "cache_unavailable" | "config";
   export interface CandlesResponse { symbol: string; interval: Interval; candles: ApiCandle[]; source: "cache" | "api"; stale: boolean; notice: Notice | null }
   export interface ErrorResponse { error: { code: ErrorCode; message: string } }
   ```
2. `limits.ts`: `CREDITS_PER_MINUTE = 8`, `CREDITS_PER_DAY = 800`, `CREDITS_PER_CALL = 1`, `BUSY_RETRY_SECONDS = 3`.
3. `get-chart-candles.ts` (`import "server-only"`):
   - Signature: `getChartCandles(symbol: string, interval: Interval, deps: { store: CandleStore; provider: DataProvider; now?: () => Date }): Promise<ChartCandlesResult>`, where:
     ```ts
     type ChartCandlesResult =
       | { ok: true; candles: Candle[]; source: "cache" | "api"; stale: boolean; notice: Notice | null }
       | { ok: false; status: 403 | 404 | 429 | 502 | 503; error: { code: ErrorCode; message: string }; retryAfterSeconds: number | null };
     ```
   - The symbol is already normalised by the caller.
   - Algorithm:
     1. **In-process de-dupe first (synchronous, before any await):** `key = \`${symbol}:${interval}\``. If `inFlight.has(key)`, return `inFlight.get(key)`. Otherwise `p = load(symbol, interval, deps)`, `inFlight.set(key, p)`, and `try { return await p } finally { inFlight.delete(key) }`. `inFlight` is a module-level `Map<string, Promise<ChartCandlesResult>>`. The whole call is de-duped, including the freshness reads, so the result doesn't depend on microtask ordering.
     2. `load`: read `latestTs = store.getLatestCandleTs()` and `lastOk = store.getLastOkFetchAt()`. If `isDailyCacheFresh(...)` → `{ ok, candles: store.getCandles(), source:"cache", stale:false, notice:null }`. **No provider call, no fetch_log write.** Otherwise continue with step 3.
     3. Budget guard:
        - `minute = sumCreditsSince(now − 60 s)`. If `minute ≥ 8` → `limited("minute", 60)`.
        - `day = sumCreditsSince(UTC midnight of now)`. If `day ≥ 800` → `limited("day", secondsUntilNextUtcMidnight)`.
     4. `leaseId = acquireFetchLease(symbol, interval, now)`. If `null` → `busy()`.
     5. `from = latestTs ? dailyTsToDate(latestTs) : undefined`, then call `provider.getCandles(symbol, interval, from)`.
     6. On success:
        - `E = expectedLatestDailyCandleDate(now)`; `keep = candles.filter(c => dailyTsToDate(c.ts) <= E)`;
        - `upsertCandles(keep)`;
        - `completeFetchLease(leaseId, { status:"ok", creditsUsed:1, candlesReceived: candles.length, message:null })`;
        - `all = getCandles()`;
        - if `all` is empty → `{ ok:false, status:404, code:"not_found" }`;
        - else `{ ok:true, candles: all, source:"api", stale:false, notice:null }`.
     7. On `ProviderError`, complete the lease with `creditsUsed: 1`:
        - `rate_limited` → status `rate_limited`, then `limited("provider", 60)`.
        - `not_found` → status `not_found`; `{ ok:false, 404, "not_found" }` if the cache is empty, else serve the cache with a `provider_error` notice.
        - `forbidden` → status `error`; 403 `forbidden` if the cache is empty, else cache plus notice.
        - `unavailable` → status `error`; 502 `provider_unavailable`, or cache plus notice.
        - `auth` / `bad_response` → status `error`; 502 `provider_error`, or cache plus notice.

        Store the provider message (max 500 chars) in `message`.
     8. `limited(kind, retryAfter)` and `busy()` serve the cache when it isn't empty: `{ ok:true, source:"cache", stale:true, notice:{code, message} }`. Otherwise:
        - limited → `{ ok:false, 429, "rate_limited", retryAfterSeconds }`;
        - busy → `{ ok:false, 503, "busy", retryAfterSeconds: 3 }`.
     9. Any `StoreError`, at any step, → `{ ok:false, 503, "cache_unavailable" }`. **The provider is never called if the store can't be read or the lease can't be written.** If `completeFetchLease` itself throws after a successful provider call, still return the candles (log `console.error`), because the stuck row expires after 60 s.
   - User-facing messages, exact text (`${S}` = symbol):
     - minute limit: `"Twelve Data's free-plan limit (8 calls a minute) has been reached. Try again in about a minute."`
     - day limit: `"Twelve Data's daily limit (800 calls) has been reached. It resets at midnight UTC (1 pm NZDT / 12 pm NZST)."`
     - provider 429: `"Twelve Data says the free-plan limit has been reached. Try again in about a minute."`
     - When serving cache with any notice, prefix `"Showing cached data. "`.
     - busy: `` `${S} is being loaded by another request. Retrying shortly…` ``
     - not_found: `` `No US ticker "${S}" was found at Twelve Data.` ``
     - forbidden: `` `${S} isn't available on the Twelve Data free plan.` ``
     - provider_unavailable: `"Couldn't reach Twelve Data. Try again shortly."`
     - provider_error: `"Twelve Data returned an unexpected error. Check the server logs."`
     - cache_unavailable: `"The price cache (Supabase) isn't reachable right now. Try again shortly."`
4. `test/helpers/fake-provider.ts`: `FakeProvider implements DataProvider`. It records `calls: {symbol, interval, from}[]`, returns queued results or errors, and has an optional `delayMs` for concurrency tests.
5. `get-chart-candles.test.ts` (MemoryCandleStore + FakeProvider + fixed `now`; all synthetic data). Each case asserts `provider.calls.length` and `store.logRows()`:
   1. Empty cache → 1 call with `from` undefined; candles stored; one log row `ok`, credits 1; `source:"api"`.
   2. **Second load right after (1) → 0 provider calls, log rows still 1, `source:"cache"`.** This is the unit proof of acceptance #3.
   3. Stale incremental: cache up to `2026-11-20`, now Wed 2026-11-25T17:00Z → 1 call with `from:"2026-11-20"`. The provider returns 11-20…11-25; **11-25 (in-progress) is not stored**; the result ends at 11-24. A repeat call → 0 calls.
   4. Holiday: cache to `2026-11-25`, now 2026-11-27T01:00Z. The provider returns only 11-25 → stored, log `ok`. A repeat call → 0 calls (clause b).
   5. Minute guard: seed log rows summing 8 credits within 60 s:
      - with cache → 0 calls, `stale:true`, notice `rate_limited`;
      - without cache → `ok:false`, 429, `retryAfterSeconds: 60`, no new log row.
   6. Day guard: 800 credits since UTC midnight (spread > 60 s ago) → 429 with retry-after = seconds to midnight UTC.
   7. Provider 429 → log row `rate_limited`, credits 1; empty cache → 429; with cache → stale and notice.
   8. Lease held: seed a pending row created 10 s ago → 0 calls; empty cache → 503 `busy`, retry 3; with cache → stale and notice `busy`.
   9. Expired lease: pending row created 61 s ago → the old row becomes `expired`, 1 call, new row `ok`.
   10. Same-instance concurrency: `Promise.all` of two calls with provider `delayMs: 20` → **1 provider call**, both results `ok`, 1 log row.
   11. `not_found` with empty cache → 404, log `not_found`.
   12. `unavailable` with cache → stale cache with notice `provider_unavailable`; log `error`.
   13. Store failure (`failNext("getLatestCandleTs")`) → 503 `cache_unavailable` and **0 provider calls**.
   14. `completeFetchLease` failure after a successful fetch → still `ok:true`.

**Done when:**
- all 14 cases pass;
- build and lint pass;
- the service imports nothing from `@/lib/data-provider/twelve-data` (only the `DataProvider` type).

**Risks:**
- The in-flight Map is per instance, which is why the DB lease exists.
- The minute/day budget guard (read sums, then call) isn't atomic across *different* symbols on separate serverless instances. Two cold loads at 7/8 could both pass, giving at most a 1–2 credit overshoot, and Twelve Data's own 429 is still handled. This is accepted for a single user; no extra locking.
- Unknown tickers never become "fresh", so each reload of a bad ticker spends 1 credit (capped by the guard). A negative cache (e.g. skip re-fetching a `not_found` series for 24 h) is deferred and only worth doing if it shows up in `fetch_log`.
- Counting credits on 429s is conservative and could slightly under-use the budget. That's acceptable.
- Stored `fetch_log` messages come from the provider; make sure no URL or key gets in.

### P1-T7 – API route `GET /api/candles/[symbol]`
**Files:** `app/api/candles/[symbol]/route.ts`, `app/api/candles/[symbol]/route.test.ts`

**Steps:**
1. `route.ts`:
   - `export const dynamic = "force-dynamic";`
   - `export async function GET(request: Request, { params }: { params: Promise<{ symbol: string }> })`.
2. Flow:
   1. `raw = (await params).symbol`; `symbol = normaliseSymbol(raw)`. If null → 400 `invalid_symbol` with message `` `"${raw}" isn't a valid ticker. Use 1–10 letters, digits, '.' or '-', e.g. AAPL.` `` (slice `raw` to 20 chars).
   2. `interval = new URL(request.url).searchParams.get("interval") ?? "1day"`. If it's not in `SUPPORTED_INTERVALS` → 400 `invalid_interval`, message `"Only daily candles (1day) are available."`.
   3. Build deps inside `try`: `store = createSupabaseCandleStore(createSupabaseAdminClient())`, `provider = getDataProvider()`. On `ConfigError` → `console.error("Missing env:", err.missing)`, then 500 `config`, message `"Server configuration is incomplete."`.
   4. `result = await getChartCandles(symbol, interval, { store, provider })`.
   5. If ok → 200 `CandlesResponse`, with `candles` mapped to `ApiCandle` (`time = Date.parse(ts)/1000`). If not → `ErrorResponse` with `result.status`, plus `Retry-After` when `retryAfterSeconds` is set.
   6. Every response sets `Cache-Control: no-store`.
   7. Any other unexpected throw → 500 `provider_error`, generic message, `console.error`.
3. `route.test.ts`:
   - `vi.mock("@/lib/candles/get-chart-candles")`, `vi.mock("@/lib/supabase/admin")`, `vi.mock("@/lib/data-provider")` (factories return dummies).
   - Call `GET(new Request("http://localhost/api/candles/aapl"), { params: Promise.resolve({ symbol: "aapl" }) })`.
   - Assert:
     - 200: the service received `"AAPL"`/`"1day"`; body matches `CandlesResponse` (`time` = seconds); `Cache-Control: no-store`.
     - `symbol "A;B"` → 400 and the service is not called.
     - `?interval=1h` → 400.
     - Service 429 → status 429, `Retry-After: 60`, `error.code` `rate_limited`.
     - Service 503 busy → `Retry-After: 3`.
     - `getDataProvider` throws `ConfigError(["TWELVE_DATA_API_KEY"])` → 500, and the body contains neither the var value nor the stack.
     - Stale-with-notice result → 200 with `notice`.

**Done when:**
- the route tests pass;
- build and lint pass;
- `next build` output lists `ƒ /api/candles/[symbol]` (dynamic).

**Risks:**
- `params` must be awaited (Next 16).
- Never return raw error objects.
- No secrets in responses or logs.

### P1-T8 – Chart page (v5 API), NZ-time labels, footer attribution
**Files:**
- `app/chart/[symbol]/page.tsx`
- `components/chart-view.tsx`
- `components/candle-chart.tsx`
- `components/site-footer.tsx` (+ `site-footer.test.tsx`)
- `lib/chart/to-chart-data.ts` (+ `.test.ts`)
- `app/layout.tsx` (add footer)

**Steps:**
1. `lib/chart/to-chart-data.ts` (pure): `toChartData(candles: ApiCandle[]): CandlestickData<UTCTimestamp>[]`, sorted ascending, de-duped by time, with `time as UTCTimestamp`. Use type-only imports from `lightweight-charts`. Test: unsorted input with a duplicate → sorted unique output with the OHLC fields.
2. `components/site-footer.tsx` (server component) renders:
   ```tsx
   <footer>
     <p>Charts: TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.{" "}
       <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">https://www.tradingview.com/</a></p>
     <p>Times shown in New Zealand time (Pacific/Auckland).</p>
   </footer>
   ```
   Add `<SiteFooter />` in `app/layout.tsx` after `<main>`. Test with `renderToStaticMarkup`: it contains `TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc.` and `href="https://www.tradingview.com/"`.
3. `components/candle-chart.tsx` (`"use client"`), props `{ candles: ApiCandle[] }`:
   - `useRef<HTMLDivElement>`.
   - One `useEffect([candles])`:
     - `chart = createChart(el, { autoSize: true, layout: { attributionLogo: true }, localization: { locale: "en-NZ", timeFormatter: (t: Time) => typeof t === "number" ? formatNzDate(t) : String(t) }, timeScale: { tickMarkFormatter: (t: Time, type: TickMarkType) => typeof t === "number" ? nzTickMarkLabel(t, type) : null } })`;
     - `series = chart.addSeries(CandlestickSeries, {}, 0)` (pane index 0 = main pane);
     - `series.setData(toChartData(candles))`; `chart.timeScale().fitContent()`;
     - cleanup `chart.remove()`.
   - Container `<div ref style={{ width: "100%", height: 480 }} />`.
   - **No v4 calls** (`addCandlestickSeries` etc.).
4. `components/chart-view.tsx` (`"use client"`), props `{ symbol: string }`:
   - State is a discriminated union `{kind:"loading"} | {kind:"ready", data: CandlesResponse} | {kind:"error", message: string}`, initialised `{kind:"loading"}`.
   - `useEffect([symbol])` runs an async function with a `cancelled` flag. It fetches `/api/candles/${encodeURIComponent(symbol)}`:
     - on 503 with `error.code === "busy"`, wait `Number(res.headers.get("Retry-After") ?? 3)` s and retry, up to 3 times;
     - on other non-OK, set `error` with `body.error.message`, or `"Something went wrong loading ${symbol}."` if the body is unparsable;
     - a network failure gives the message `"Couldn't reach the server."`.
   - **Only call setState after an await** (lint rule `react-hooks/set-state-in-effect`).
   - Render:
     - loading → `<p>Loading {symbol}…</p>`;
     - error → `<div className="error" role="alert">`;
     - ready → an optional `<div className="notice" role="status">{notice.message}</div>`, then `<CandleChart candles>`, then `<p>Last candle: {formatNzDate(last.time)} · Source: {source === "cache" ? "Supabase cache" : "Twelve Data (just fetched)"}{stale ? " (may be out of date)" : ""}</p>`.
   - An empty `candles` array (shouldn't happen) → error message `"No candles to show."`.
5. `app/chart/[symbol]/page.tsx` (server component):
   - `export default async function Page({ params }: { params: Promise<{ symbol: string }> })`;
   - `symbol = normaliseSymbol((await params).symbol)`; if null → `notFound()`;
   - render `<h1>{symbol}</h1><p>Daily candles</p><ChartView key={symbol} symbol={symbol} />`;
   - `generateMetadata({ params })` awaits params and normalises: valid → title `` `${symbol} – Market Charter` ``; `null` → title `"Chart – Market Charter"` (never throws).
6. **Secret-leak check** (no keys needed):
   ```bash
   TWELVE_DATA_API_KEY=leakcheck-td-9f3a SUPABASE_SECRET_KEY=leakcheck-sb-7c1d NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co npm run build
   ! grep -rl "leakcheck-" .next/static && ! grep -rl "api.twelvedata.com" .next/static && echo LEAK_CHECK_OK
   ```
7. **v5 check:** `grep -rnE "add(Candlestick|Line|Area|Bar|Histogram|Baseline)Series\(" app components lib` returns nothing, and `grep -rn "addSeries(CandlestickSeries" components` returns 1 line.

**Done when:**
- build, lint and test pass (footer and to-chart-data tests);
- LEAK_CHECK_OK printed;
- the v5 grep checks pass;
- `next build` lists `ƒ /chart/[symbol]`;
- `npm run dev`: `/chart/AAPL` renders the heading, the "Loading AAPL…" state and the footer, and with no env shows the red "Server configuration is incomplete." box rather than a crash. Check by hand with `curl -s localhost:3000/chart/AAPL | grep -c "TradingView Lightweight Charts"` (expected ≥ 1) and `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/candles/AAPL` (expected 500 without keys).
- `/chart/%3B` → 404.

**Needs keys:** seeing real candles drawn (P1-T9).

**Risks:**
- lightweight-charts touches `window`, so it is only used inside a `"use client"` component's effect.
- Client code must not import any `server-only` module; the build fails if it does, which is a useful guard.

### P1-T9 – Live acceptance proof (needs Tom's keys and network to Twelve Data and Supabase)
No code. Run it once `.env.local` exists and the session (or Tom's machine) can reach `api.twelvedata.com` and `<project-ref>.supabase.co`. This cloud session currently **cannot** reach either host. Record every output in PROGRESS.md.

**Steps:**
1. Apply the migration (README "Database setup"). In the SQL editor run `select relname, relrowsecurity from pg_class where relname in ('candles','fetch_log','watchlist','indicator_prefs');` → 4 rows, all `true`.
2. `set -a; . ./.env.local; set +a; RUN_SUPABASE_TESTS=1 npm test` → the integration contract passes (0 Twelve Data credits; it deletes only `ZZTEST%` rows).
3. `npm run build && npm start`.
4. SQL: `select count(*) from fetch_log where symbol='AAPL';` → 0.
5. Open `http://localhost:3000/chart/AAPL` → candlestick chart, footer notice, status line "Source: Twelve Data (just fetched)". **Take a screenshot.** SQL: `select symbol, "interval", credits_used, status, candles_received, created_at from fetch_log where symbol='AAPL' order by id;` → 1 row, `ok`, 1 credit.
6. Reload the page twice, then run `curl -s localhost:3000/api/candles/AAPL | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.source,j.candles.length)})"` → `cache <n>`. Re-run the step 5 SQL → **still 1 row** (acceptance #3). `select count(*), min(ts), max(ts) from candles where symbol='AAPL';` → n rows, with the max equal to the expected latest trading date.
7. Bad ticker: `/chart/ZZZZQX` → friendly "No US ticker…" box; one `fetch_log` row with status `not_found`.
8. Concurrency on a never-loaded ticker: `for i in 1 2 3; do curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/candles/MSFT & done; wait` → the codes are 200s (or 503 busy); SQL → **exactly 1** MSFT `fetch_log` row.
9. Browser devtools Network tab on `/chart/AAPL`: only `/api/candles/AAPL` is requested, nothing to `api.twelvedata.com`.
10. Vercel (Tom): link the repo, add the 3 env vars, deploy a preview, open `/chart/AAPL` → `source` should be `cache` with 0 new `fetch_log` rows (shared cache).
11. Next US trading day (optional): reload `/chart/AAPL` → exactly 1 new `ok` row whose request used `start_date` = the previous last date. This is natural proof of the stale path with no data deleted.

**Done when:** steps 1–9 are recorded in PROGRESS.md with SQL output and the screenshot, and step 10 is done or explicitly handed to Tom. Acceptance boxes are ticked only with this proof.

**Risks:**
- Spend credits only as listed.
- Don't delete cache or log rows to "force stale" (the brief requires asking first). Staleness is proven by the unit tests and step 11.
- Rate-limit UX is proven by the unit and route tests, not by burning real credits.

---

## API credit estimate (Phase 1)
| Activity | Twelve Data credits |
|---|---|
| P1-T1 … P1-T8 (all tests mock the provider; Supabase tests use fake fetch or skip) | **0** |
| P1-T9 step 2 (Supabase integration tests) | 0 |
| P1-T9 step 5 (AAPL first load, backfill up to 5000 bars) | 1 |
| P1-T9 step 6 (repeat loads) | 0 |
| P1-T9 step 7 (bad ticker) | 1 |
| P1-T9 step 8 (MSFT concurrency) | 1 |
| P1-T9 step 10 (Vercel preview, cache hit) | 0 |
| P1-T9 step 11 (next-day refresh) | 1 |
| **Expected total** | **≈ 4 credits**. Allow ≤ 15 for retries. Peak ≤ 3 in any minute |

This is well within 8/min and 800/day.

---

## Open questions for Tom
1. **Keys and network for the live proof (P1-T9).** This cloud session has no Twelve Data or Supabase keys, and its network blocks `api.twelvedata.com` and `*.supabase.co`/`supabase.com`. P1-T1 to P1-T8 can be built and fully tested without them. For P1-T9, either:
   - (a) run the P1-T9 steps on your own machine after creating the Supabase project and `.env.local`, or
   - (b) add the keys as environment secrets and allow `api.twelvedata.com` and your `<project-ref>.supabase.co` host for this environment.

   Which do you prefer? The Vercel link (step 10) needs you either way.

Decisions taken in this plan. Flag any you disagree with; none need an answer to proceed:
- All four tables are created now, so no schema change is needed in Phase 2–4.
- Daily bars are stored as `date 00:00Z`. The in-progress US-session bar is never cached, so charts update after 18:00 New York time (about noon NZ).
- The env vars are `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY`, not "anon/service role".
- **Test-data deletion ("ask before deleting data" rule):** the opt-in Supabase integration test (P1-T5, run in P1-T9 step 2) deletes only the rows it created itself (`symbol like 'ZZTEST%'` in `candles` and `fetch_log`). Nothing else is ever deleted. If you'd rather it didn't delete at all, say so and the cleanup will be dropped; the test rows would then stay in the tables.

---

## Review round 1 fixes

**Required**
1. **P1-T4: initial backfill relied on unverified `order=asc` + `outputsize=5000` behaviour.** Fixed:
   - The request no longer sends `order`; it uses Twelve Data's default `desc`, so the backfill gets the latest 5000 bars. Step (d) already sorts ascending and de-dupes locally.
   - New T4 tests:
     - the URL has no `order` param, and the exact param set is checked for both the backfill and incremental requests;
     - the fixture is newest-first, and the result is asserted to come back ascending.
   - Verified facts now record that `order` is never sent, and why.
   - The T9 step 6 check (`max(ts)` = expected latest trading date) is unchanged.

**Optional points**
| Point | Applied? | How |
|---|---|---|
| T2/T5 `process.env` grep contradiction | Yes | The T2 grep now excludes `*.test.ts(x)` and states it applies to non-test source only |
| T6 negative cache for unknown tickers | No (noted) | Added to T6 Risks as deferred; the budget guard already caps the cost |
| T6 guard not atomic across symbols and instances | Yes (note) | Added to T6 Risks: at most 1–2 credits overshoot, Twelve Data's 429 is still handled, accepted for a single user |
| T4 400 mapping too broad | Yes | `not_found` now only when the message matches `/symbol/i`; new test: "Invalid interval provided" → `bad_response` |
| T8 `generateMetadata` null symbol | Yes | Falls back to the title "Chart – Market Charter" |
| T5/T9 ZZTEST deletion awareness | Yes | Added under "Decisions taken" in Open questions, with the option to drop the cleanup |
| T6 case 10 microtask ordering | Yes | In-process de-dupe moved to the very start of `getChartCandles` (synchronous, before any await) and keyed on the whole call |
