# PLAN – Phase 2: Watchlist

Planner draft, round 2 (2026-11-25). Phase 1 is done and its plan is archived at `docs/plans/PLAN-phase1.md`. This round fixes `PLAN_REVIEW.md` (Phase 2, round 1: CHANGES NEEDED); see "Review round 1 fixes" at the bottom.

> **Project switch.** The Supabase project this plan was first researched against has been **deleted**. The replacement is a new, **empty** project in Sydney (no tables, no cached candles, no `fetch_log` rows). The new orchestrator step **O0** points `.env.local` at it and re-applies the Phase 1 migration unchanged. **No project ref is hard-coded in this plan:** every Management API call derives it from `NEXT_PUBLIC_SUPABASE_URL` (see "Deriving the project ref").

---

## Verified facts (checked 2026-11-25, not from memory)

### Packages (`npm view`, plus the 0.12.7 tarball unpacked in scratch)
| Package | Latest | Use in Phase 2 |
|---|---|---|
| `@supabase/ssr` | 0.12.7 (2026-09-08). Peer: `@supabase/supabase-js ^2.114.0`. We have 2.119.2 | **Install, pinned exact** |
| `@supabase/supabase-js` | 2.119.2 | Already installed. No change |
| `technicalindicators` | Not needed yet | Not installed (Phase 3) |

- `@supabase/ssr` 0.12.x only supports `cookies: { getAll, setAll }`. The old `get`/`set`/`remove` methods are deprecated.
- **`setAll(cookiesToSet, headers)` takes a second argument:** cache headers (`Cache-Control: private, no-cache, no-store…`, `Expires: 0`, `Pragma: no-cache`). The proxy must copy them onto the response, so a CDN never caches a response that carries a session cookie.
- `createServerClient` loads the session lazily. The first `getClaims()` / `getUser()` / `getSession()` call triggers a token refresh, which writes cookies through `setAll`. Supabase's guidance is to call `getClaims()` straight after creating the client in the proxy, with **no code in between**.
- **Use `getClaims()` for authorisation, never `getSession()`, on the server.** `getClaims()` verifies the JWT signature.
  - With an asymmetric signing key in use (ES256/RS256), the check is local against a cached JWKS, so there's no Auth round trip per request.
  - With only the legacy HS256 secret, `getClaims()` falls back to an Auth server call per request. It is still correct, just one round trip slower. **No code change either way.**
  - The deleted project had ES256 in use. **The new project's signing-key type is read in O0 and recorded in PROGRESS.md.** Do not rotate or create signing keys in this phase.

### Next.js 16.4.6 (from `node_modules/next/dist/docs/`)
- **`middleware.ts` is deprecated and renamed `proxy.ts`.** It lives at the project root, next to `app/`. The export is `export function proxy(request: NextRequest)` (or default), plus `export const config = { matcher: [...] }`. The proxy runs on the **Node.js runtime** by default, and the `runtime` option is not allowed there.
- The proxy is for "optimistic checks" only. The docs say it should not be the only auth gate. **Every Route Handler and Server Action must check auth itself.** Layouts don't re-render on client navigation, so a layout check is not a security boundary either.
- `cookies()` is async. It can **set** cookies only in Server Functions (Server Actions) and Route Handlers, not while rendering a Server Component. `redirect()` throws, so it must not sit inside a `try` that swallows it.
- Server Actions get a built-in Origin/Host CSRF check. They still have to validate their input and authenticate themselves.
- `params` and `searchParams` are Promises (as in Phase 1).

### Supabase's Next.js SSR pattern (Supabase docs via the MCP doc search; supabase.com itself is blocked here)
- Files: `lib/supabase/server.ts` (`createServerClient` + `cookies()`, with `setAll` wrapped in try/catch for Server Components), `lib/supabase/proxy.ts` (`updateSession`) and the root `proxy.ts`.
- The matcher excludes `_next/static`, `_next/image`, `favicon.ico` and image files.
- Env var name: **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`**. The deleted project had a `publishable default` key. **O0 reads the new project's publishable and secret keys** and stops if either type is missing.

### Email auth: decision = **email + password**, not magic link
Auth config of the **deleted** project, read via the Management API (historical; **O0 re-reads the new project's config** and records it in PROGRESS.md):
- `external_email_enabled: true`
- `disable_signup: false` (**strangers can sign up today**)
- `smtp_host` unset (Supabase's built-in SMTP)
- `rate_limit_email_sent: 2` per hour
- `site_url: http://localhost:3000`, `uri_allow_list: ""`
- `password_min_length: 6`
- `auth.users` count = 0

Supabase docs ("Send emails with custom SMTP") say the built-in SMTP **only delivers to the organisation's team-member addresses**, at a tiny hourly limit, with no SLA. Magic links would therefore need one of two things: Tom's email must be a member of the Supabase org, or we add a custom SMTP service (a new service, so ask first). They would also need redirect URLs configured for localhost, Vercel previews and production, and a `/auth/confirm` route.

Email + password needs **no email at all**:
- the user is created by an admin with `email_confirm: true`;
- `disable_signup: true` blocks public sign-ups;
- admin/dashboard user creation still works.

This is the simplest secure option for one user. The brief's "Supabase email login" is satisfied: it's Supabase's Email provider. Magic link remains a later option if Tom wants it.

The decision doesn't depend on the deleted project's values. The built-in SMTP limits are documented platform behaviour, and O3 explicitly sets every field the design relies on (`disable_signup`, `password_min_length`, `external_email_enabled`, `external_anonymous_users_enabled`). If O0 shows the new project already has custom SMTP configured, record it; the plan is unchanged.

Management API `PATCH /v1/projects/{ref}/config/auth` fields (from the published OpenAPI spec): `disable_signup`, `password_min_length` (6–32767), `external_email_enabled`, `external_anonymous_users_enabled`, `site_url`, `uri_allow_list`.

### Twelve Data `symbol_search` (via web search of `twelvedata.com/docs/llms/discovery/symbol-search.md` and `llms-full.txt`; the docs host itself is blocked here)
- `GET https://api.twelvedata.com/symbol_search`
- Required param: `symbol` (ticker or ISIN). Optional: `outputsize` (max 120; default ~30), `show_plan`.
- **Cost: 1 API credit per request.** Results are ordered by relevance.
- Response: `{ "data": [ { "symbol", "instrument_name", "exchange", "mic_code", "exchange_timezone", "instrument_type", "country", "currency" } ], "status": "ok" }`.
  - The documented field list names only `symbol`, `instrument_name`, `country`, `currency` (and `access`). `exchange`, `mic_code` and `instrument_type` appear only in the example.
  - **The parser therefore requires only `symbol`.** Everything else is optional, and US detection uses `country` first, then `mic_code`.
  - **Unverified until P2-T9:** the exact `country` string for the US ("United States") and whether `mic_code` is present.
- Errors use the same JSON `{status:"error", code, message}` shape as `time_series`, including errors inside HTTP 200.
- Auth: the same `Authorization: apikey …` header.

### `/quote` vs cached candles for the sidebar: decision = **cached candles only, no `/quote`**
- `/quote` costs **1 credit per symbol**. A 10-ticker sidebar would cost 10 credits per view, which is over the 8/min cap on a single page load.
- Cached daily candles give the last completed close and the previous close for **0 credits**.
- "Last price" is therefore the **last completed session's close**, labelled with its date (e.g. "24 Nov 2026"). "Day % change" is that close against the previous session's close. This matches the brief's "from cached data where possible", and the data is the same data the chart shows.
- A stale or cold ticker is refreshed through the existing cache-first candle service (1 credit, at most once per ticker per trading day, paced; see "Sidebar refresh").

### Project state
- **New project (Sydney), per the orchestrator, 2026-11-25:** empty. No tables, no cached candles, no `fetch_log` rows, no auth users.
- **After O0:** the 4 tables from `supabase/migrations/20261125000000_initial_schema.sql` (re-applied unchanged), RLS on all 4, policies `watchlist_owner_all` and `indicator_prefs_owner_all`, and **0 rows everywhere**. So **every ticker is cold** in T9.
- **The deleted project's state is gone:** the AAPL/MSFT candles (5000 rows each) and the 4 `fetch_log` rows/credits from Phase 1's proof. Nothing in this plan relies on them any more.
- **Schema facts come from the migration file, not the live project:**
  - `fetch_log."interval"` is free `text` with **no CHECK constraint** (only `candles."interval"` has one, migration line 13). So a `symbol_search` call can be logged as `interval = 'symbol_search'` with **no schema change**.
  - `fetch_log_one_pending_per_series` is unique on (`symbol`, `"interval"`) where `status = 'pending'`, so `symbol_search` leases stay separate from `1day`.

### Deriving the project ref (used by every Management API call)
Never hard-code a ref. After O0 has updated the URL in `.env.local`:
```bash
set -a; . ./.env.local; set +a
ref=$(node -p 'new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]')
[[ "$ref" =~ ^[a-z0-9]{20}$ ]] || { echo "bad ref"; exit 1; }
```
Then call `https://api.supabase.com/v1/projects/$ref/...`. SQL checks go through `POST /v1/projects/$ref/database/query` with body `{"query": "..."}`. The Management API token is injected by the sandbox proxy.

---

## Phase 2 – Watchlist: acceptance criteria (from the brief)
- [ ] Supabase email login (single user is fine)
- [ ] Add, remove and reorder tickers. The ticker is checked against the Twelve Data symbol search before it's saved
- [ ] The sidebar watchlist shows the last price and the day's % change (from cached data where possible)

Plus the definition of done: `npm run build`, `npm run lint` and `npm test` pass; proof recorded; `PROGRESS.md` updated; no secrets; `.env.example` current.

| Criterion | Covered by | Proof |
|---|---|---|
| Email login | T1 (proxy, session, server client), T2 (login and logout UI, protected routes), O0 (new project, keys), O2–O3 (users, auth config) | Unit tests (access rules, next-path, sign-in errors, proxy cookie copy). T9 live: redirects, 401s, wrong and right password, sign-up refused |
| Add / remove / reorder, checked with symbol search | T3 (provider search, US match), T4 (budget-guarded, logged check), T6 (service), T7 (routes), T8 (UI) | Service and route tests with fakes. T9 live: add AAPL/MSFT/NVDA, reject ZZZZQX, duplicate, invalid; reorder and remove survive a reload; `fetch_log` rows |
| Sidebar last price + day % change from cache | T5 (recent candles, quote maths, formatters), T6/T7 (list and refresh), T8 (sidebar and paced refresh queue) | Unit tests of the quote maths. T9 live: sidebar values match SQL on the last two closes; cached tickers cost 0 credits |

**Schema:** no change. The plan uses the existing `watchlist` (with `sort_order`), and `fetch_log` with `interval = 'symbol_search'`. `indicator_prefs` is untouched.

---

## Key design decisions

### 1. Everything behind login, including `/chart/[symbol]` and `/api/candles/[symbol]`
**Decision: protect all pages and all API routes. Only `/login` is public.**

Why:
- The scarce shared resource is the Twelve Data budget (8/min, 800/day). `/api/candles/[symbol]` is the route that spends it.
- Today anyone who finds the URL can request random tickers. Unknown tickers never become "fresh", so each one burns 1 credit, and that could exhaust the daily budget or block Tom for a minute at a time.
- The brief says personal use only, and the chart data has no reason to be public.

The cost:
- Phase 1-style `curl` proofs now need a session cookie.
- A Vercel preview needs a login.

Both are acceptable.

How it is layered:
- **`proxy.ts`** refreshes the session on every matched request. It redirects logged-out **page** requests to `/login?next=…`, and sends a logged-in user who visits `/login` to `/`. It never redirects `/api/*`.
- **Every route handler** checks `getClaims()` itself and returns `401 {error:{code:"unauthorized"}}`.
- **Every Server Action** that needs a user checks too. Login itself doesn't, since it is the login.
- The `(app)` layout also redirects when there's no user (defence in depth), but it is not relied on.

### 2. Supabase clients: which key touches which table
| Client | Key | Used for | Where |
|---|---|---|---|
| `createSupabaseAdminClient()` (Phase 1) | secret | `candles`, `fetch_log` (RLS on, no policies, service_role grants only) | Server only, unchanged |
| `createSupabaseServerClient()` (new) | publishable + the user's JWT from cookies | `watchlist` (RLS `auth.uid() = user_id`), `auth.*` | Server only (Route Handlers, Server Actions, Server Components) |
| Proxy client (new, inside `updateSession`) | publishable | Session refresh + `getClaims()` only | `proxy.ts` |

- **There is no browser Supabase client.** Login and logout are Server Actions, and data goes through Route Handlers. So no Supabase code ships to the browser.
- The publishable key is still named `NEXT_PUBLIC_…`, as Supabase does and as the Phase 1 plan promised. It is read only on the server.
- Watchlist rows are only ever touched with the user-scoped client, so RLS is the real access control. The service never passes `user_id` from client input. The insert relies on the column default `auth.uid()`.

### 3. Ticker validation before saving (US only)
Add flow, cheapest checks first:
1. `normaliseSymbol` (format).
2. Already in the list → 409 (0 credits).
3. List full (30) → 409 (0 credits).
4. **`checkUsSymbol`** (1 credit):
   - local budget guard (shared with candles; same 8/min and 800/day sums);
   - DB lease on (`symbol`, `'symbol_search'`), which de-dupes double-clicks;
   - `provider.searchSymbols(symbol)`;
   - `fetch_log` row completed with 1 credit.
5. Insert.

US rule (`pickUsListing`):
- keep only results whose `symbol` equals the ticker exactly (case-insensitive);
- of those, accept `country === "United States"` or `mic_code` in {XNAS, XNGS, XNMS, XNCM, XNYS, ARCX, BATS, XASE, IEXG};
- prefer `Common Stock`, then `ETF`, then the first.

Outcomes:
- An exact match listed only outside the US → 422 `not_us`.
- No exact match → 404 `not_found`.

`fetch_log` status for searches:
- `ok` = a US listing was found;
- `not_found` = none (the message lists up to 5 `SYMBOL@EXCHANGE(country)` results, so a field-name surprise can be debugged without another credit);
- `rate_limited` / `error` as for candles.

`sumCreditsSince` already sums every row, so search credits count towards the budget guard automatically. `getLastOkFetchAt` filters by interval, so search rows never make a candle series look fresh.

### 4. Sidebar data: cache-only list + paced background refresh
- **`GET /api/watchlist` never calls Twelve Data (0 credits).** For each row it reads the last 2 cached daily candles and the last ok fetch time, and returns:
  - `{ symbol, quote: { lastClose, prevClose, changePct, asOf, stale } | null }`
  - `quote: null` means nothing is cached yet (a cold ticker).
  - `stale` uses Phase 1's `isDailyCacheFresh`, so it is holiday-aware.
- **The refresh queue (client, in the sidebar):** after the list loads, the sidebar refreshes the tickers that are cold or stale, **one at a time, in watchlist order**, via `POST /api/watchlist/refresh {symbol}`. That route reuses `getChartCandles` (cache-first, budget guard, lease, de-dupe) and returns only the new quote, not 5000 candles.
  - **Pacing:** after a refresh that called Twelve Data (`source: "api"`, or a provider error, since a credit was spent), the queue waits **10 s** (≤ 6 credits/min). That leaves ≥ 2/min for adding a ticker or opening a chart.
  - Cache hits continue straight away.
  - **On any rate limit** (429, or a cache-served `rate_limited` notice), the queue **stops** and shows: "Paused: <message> Click Retry to continue." It does not auto-retry, so it can never loop against the limit.
  - **On busy** (another request is loading the same ticker), it retries after 3 s, at most 3 times, then skips.
  - **On 401**, it stops and shows a log-in link.
- **Cold sidebar example, 10 tickers, nothing cached:**
  - the list shows 10 rows with "—" and "Not loaded yet" instantly (0 credits);
  - the queue then backfills them at 6/min, so all are filled after about 100 s (10 credits).
  - If something else spends credits meanwhile, the budget guard stops the queue with a clear message and the rows keep showing "—" or the cached values.
- **Daily steady state:** each ticker goes stale once per US trading day, after 18:00 New York time (≈ noon NZ). Refreshing costs 1 credit per ticker per day (10/day for 10 tickers).
- **Opening a chart** still uses `/api/candles/[symbol]` (unchanged). When that load actually fetched (`source:"api"`), `ChartView` fires a window event and the sidebar re-reads the list (0 credits) to pick up the new close.

### 5. Reorder persistence (`sort_order`)
- The UI has **Up / Down buttons** on each row. They're accessible and easy to drive in Playwright, and need no drag-and-drop library (no stack change).
- The client updates optimistically, then sends `PATCH /api/watchlist {symbols:[…full new order…]}`.
- The server:
  1. validates the body;
  2. reads the current rows (RLS);
  3. if the sets differ, returns 409 `order_mismatch` (the list changed in another tab, and the client reloads);
  4. otherwise updates **only rows whose `sort_order` changed** to their new index, one `update().eq("symbol", s)` per row.
- No upsert is used, so a row removed in another tab can never be re-created.
- New rows get `max(sort_order)+1`. Reads order by `sort_order, created_at`, so a tie is harmless.

### 6. Limits and constants (new)
| Constant | Value | Why |
|---|---|---|
| `MAX_WATCHLIST_ITEMS` | 30 | Bounds the per-row cache reads in `GET /api/watchlist` (2 small queries per row) and the refresh-queue cost (≤ 30 credits/day) |
| `REFRESH_PACE_MS` | 10 000 | ≤ 6 credits/min from the queue |
| `REFRESH_BUSY_RETRY_MS` / `MAX_REFRESH_BUSY_RETRIES` | 3 000 / 3 | Matches Phase 1's busy handling |
| `AUTH_RETRY_DELAY_MS` | 1 000 | One retry on 401. It covers parallel requests racing a single-use refresh token, as `@supabase/ssr` documents |
| `MAX_LOG_MESSAGE_LENGTH` | 500 | Moved from `get-chart-candles.ts` to `limits.ts` so it can be shared |

---

## Orchestrator steps (not Executor work)
All are run by the orchestrator via the Supabase Management API (`api.supabase.com`, token injected by the proxy), the session's environment tools, or a local Node one-off. **Never print or commit key values or passwords.** Every Management API path uses `$ref` from "Deriving the project ref"; no ref is typed by hand. Run every Node process with `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

| ID | When | Step | Verify |
|---|---|---|---|
| **O0** | Right after plan approval, **before P2-T1** | **Move to the new project.** See the O0 sub-steps below the table | All O0 checks below pass and are recorded in PROGRESS.md (values never printed) |
| **O1** | — | **Folded into O0** (sub-step 4 reads the publishable key with the secret key) | — |
| **O2** | Before P2-T9 | Create the **E2E test user** with the admin API and `SUPABASE_SECRET_KEY` (e.g. `node -e` with `supabase-js` `auth.admin.createUser({ email: "e2e@example.com", password: <random 24 chars from crypto.randomBytes>, email_confirm: true })`). Append `E2E_USER_EMAIL` and `E2E_USER_PASSWORD` to `.env.local` only | SQL via `POST /v1/projects/$ref/database/query`: `select count(*) from auth.users where email='e2e@example.com' and email_confirmed_at is not null` → 1 |
| **O3** | After O2, before P2-T9 | `PATCH /v1/projects/$ref/config/auth` with `{"disable_signup": true, "password_min_length": 12, "external_email_enabled": true, "external_anonymous_users_enabled": false}` | `GET /v1/projects/$ref/config/auth` shows `disable_signup: true`, `password_min_length: 12`, `external_email_enabled: true`. P2-T9 step 3 proves a public sign-up is refused |
| **O4** | After O3 (optional) | Run the Supabase security advisors (MCP `get_advisors`, type `security`, for `$ref`) and paste any auth or RLS findings into PROGRESS.md | Recorded |
| **O5** | When Tom has a Vercel production URL (later) | `PATCH /v1/projects/$ref/config/auth` `{"site_url": "https://<prod-domain>"}`. Only email links use it, and we send none, so it's tidy-up, not a blocker | — |

**O0 sub-steps (in order; stop and report on any failure, don't improvise):**
1. **Sandbox network.** Call `get_environment`. If the new project's host (`oxepsjesqzpkmljajwti.supabase.co`, the host of the new `NEXT_PUBLIC_SUPABASE_URL`) isn't allowed, propose `update_environment` with `add_allowed_hosts: [<that host>]`. Tom approves the prompt. If the deleted project's `*.supabase.co` host is listed, remove it in the same call with `remove_allowed_hosts`. `api.supabase.com` must already be allowed (it was used in Phase 1); if it isn't, add it in the same call.
2. **URL in `.env.local`.** Replace the `NEXT_PUBLIC_SUPABASE_URL=` line with `NEXT_PUBLIC_SUPABASE_URL=https://oxepsjesqzpkmljajwti.supabase.co` (the value Tom gave; the URL isn't secret). Use a small Node or `sed -i` edit that touches only that line. Don't `cat` the file.
3. **Derive and confirm the ref.** Run the "Deriving the project ref" snippet. Then `GET /v1/projects/$ref` must return 200 with `region: "ap-southeast-2"` (Sydney) and `status: "ACTIVE_HEALTHY"`. Record the ref, region and status. A 404 means the URL is wrong: stop.
4. **Keys.** `GET /v1/projects/$ref/api-keys?reveal=true`, piped straight into a Node one-off (no echo, no temp file outside the scratchpad, nothing logged) that:
   - picks the first key with `type: "secret"` and the first with `type: "publishable"`;
   - exits non-zero, naming only the missing **type**, if either is absent (then stop and ask Tom; don't create keys);
   - rewrites `.env.local` in place: replaces the `SUPABASE_SECRET_KEY=` line, and replaces or appends `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`. Other lines (`TWELVE_DATA_API_KEY`) are left untouched.

   Verify, values never printed:
   - `grep -c '^SUPABASE_SECRET_KEY=sb_secret_' .env.local` → 1;
   - `grep -c '^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_' .env.local` → 1;
   - `grep -c '^TWELVE_DATA_API_KEY=.\+' .env.local` → 1.
5. **Migration.** Apply `supabase/migrations/20261125000000_initial_schema.sql` **unchanged**: `jq -n --rawfile q supabase/migrations/20261125000000_initial_schema.sql '{query: $q}' | curl -sS -X POST "https://api.supabase.com/v1/projects/$ref/database/query" -H "Content-Type: application/json" --data-binary @-`. Don't edit, split or reorder the file. If the call fails, stop and report the error (don't patch the SQL).
   - `git diff --exit-code supabase/` → clean (the file was not changed). Record `sha256sum` of the file in PROGRESS.md.
6. **Schema and RLS checks** (SQL via `POST /v1/projects/$ref/database/query`):
   - `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('candles','fetch_log','watchlist','indicator_prefs') order by relname` → **4 rows, all `true`**;
   - `select tablename, policyname from pg_policies where schemaname = 'public' order by 1, 2` → exactly `indicator_prefs / indicator_prefs_owner_all` and `watchlist / watchlist_owner_all`;
   - `select has_table_privilege('authenticated','public.watchlist','insert'), has_table_privilege('service_role','public.fetch_log','insert')` → `true, true`;
   - `select (select count(*) from public.candles), (select count(*) from public.fetch_log), (select count(*) from public.watchlist), (select count(*) from auth.users)` → `0, 0, 0, 0`.
7. **Live key check (0 Twelve Data credits).**
   - Secret key + URL + network: a Node one-off with `supabase-js` `createClient(url, secret).from("fetch_log").select("*", { count: "exact", head: true })` → no error, count 0. This is the same path the app's admin client uses.
   - Publishable key: `curl -s -o /dev/null -w "%{http_code}\n" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"` → `200`.
8. **Re-read auth config and signing keys** (read-only), and record in PROGRESS.md:
   - `GET /v1/projects/$ref/config/auth` → `external_email_enabled`, `disable_signup`, `smtp_host` (set or unset only), `rate_limit_email_sent`, `site_url`, `uri_allow_list`, `password_min_length`, `external_anonymous_users_enabled`;
   - `GET /v1/projects/$ref/config/auth/signing-keys` → each key's `algorithm` and `status` (no key material). Record whether an asymmetric key (ES256/RS256) is `in_use`, or only legacy HS256 (see "Verified facts": both work; HS256 means one Auth round trip per `getClaims()`);
   - `GET /v1/projects/$ref/api-keys` (no `reveal`) → the key **types** present.
   - No PATCH here. O3 applies the auth settings after O2.

**Tom steps (not blockers for the build or proof):**
1. Create your own account **in the new project**. In the Supabase dashboard go to Authentication → Users → **Add user → Create new user**, tick **Auto Confirm User**, and use a password of 12 or more characters. Admin-created users work with sign-ups disabled.
2. When you link Vercel, use the **new** project's values: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` (both changed with the project switch), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (new in Phase 2) and `TWELVE_DATA_API_KEY` (unchanged).

---

## Tasks

Conventions (same as Phase 1):
- kebab-case files, `@/` imports, no `any`;
- tests sit next to their source as `*.test.ts(x)`;
- synthetic fixtures are labelled `// synthetic test data, not real prices`;
- client components set state only after an `await` or in callbacks (the `react-hooks/set-state-in-effect` lint rule errors otherwise);
- every JSON route response has `Cache-Control: no-store`.

### P2-T1 – Auth foundation: `@supabase/ssr`, server client, session helper, `proxy.ts`
**Files:**
- Change: `package.json`, `package-lock.json`, `lib/env.ts`, `.env.example`, `test/env-example.test.ts`, `README.md`
- Create:
  - `lib/config-error.ts` (+ `lib/config-error.test.ts`)
  - `lib/supabase/public-config.ts` (+ `.test.ts`)
  - `lib/supabase/server.ts`
  - `lib/auth/session.ts`
  - `lib/auth/next-path.ts` (+ `.test.ts`)
  - `lib/auth/route-access.ts` (+ `.test.ts`)
  - `lib/supabase/proxy.ts` (+ `.test.ts`)
  - `proxy.ts` (repo root)

**Steps:**
1. `npm install --save-exact @supabase/ssr@0.12.7`.
2. **`lib/config-error.ts`** (no `server-only`; the proxy imports it):
   - Move `ConfigError` and `readEnv` here from `lib/env.ts`, unchanged, and export both.
   - `lib/env.ts` keeps `import "server-only"`, imports `readEnv` from here, and re-exports `ConfigError` (`export { ConfigError } from "@/lib/config-error"`), so existing imports keep working.
   - Move the generic `ConfigError` tests if needed. The `lib/env.test.ts` tests must still pass unchanged.
3. **`lib/supabase/public-config.ts`** (no `server-only`): `getSupabasePublicConfig(): { url: string; publishableKey: string }` via `readEnv(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])`. Test: missing names are reported; values are trimmed.
4. **`.env.example`**: insert after the URL line:
   ```
   # Supabase publishable key (sb_publishable_...). Safe for the browser, but only read on the server.
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
   # Optional, local only: login used by the Playwright acceptance run. Never set in Vercel.
   E2E_USER_EMAIL=
   E2E_USER_PASSWORD=
   ```
   `test/env-example.test.ts`:
   - (a) the required keys now include `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
   - (c) the `NEXT_PUBLIC_` keys must equal exactly `["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]`.
5. **`lib/supabase/server.ts`** (`import "server-only"`):
   ```ts
   export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>>
   ```
   - It is `createServerClient<Database>(url, publishableKey, { cookies: { getAll: () => cookieStore.getAll(), setAll(cookiesToSet) { try { for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options); } catch { /* Server Component render: proxy.ts refreshes the session */ } } } })`, with `cookieStore = await cookies()`.
   - Create a new client per call; never cache it at module level.
   - If the return type doesn't assign to `SupabaseClient<Database>`, use `ReturnType<typeof createServerClient<Database>>` through an exported alias `ServerSupabaseClient`, and use that alias everywhere below. Don't use `any`.
6. **`lib/auth/session.ts`** (`import "server-only"`):
   ```ts
   export interface SessionUser { id: string; email: string | null }
   export interface AuthContext { supabase: SupabaseClient<Database>; user: SessionUser | null }
   export async function getAuthContext(): Promise<AuthContext>
   ```
   - Create the server client, then `const { data, error } = await supabase.auth.getClaims()`.
   - `user = data?.claims?.sub ? { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : null } : null`.
   - On `error`, user = null (no throw).
   - A `ConfigError` from client creation **propagates**, and callers map it to a 500.
7. **`lib/auth/next-path.ts`**: `safeNextPath(raw: unknown): string` returns `raw` only if all of these hold:
   - it is a string of 1–200 chars;
   - it starts with `/`;
   - it does not start with `//`;
   - it contains no `\`;
   - it does not start with `/login`.

   Otherwise it returns `/`.

   Tests: `/chart/AAPL` ok; `/chart/AAPL?x=1` ok; `//evil.com`, `/\evil.com`, `https://evil.com`, `javascript:alert(1)`, `""`, `/login`, `/login?next=/x`, a 201-char path, `null`, `42` all → `/`.
8. **`lib/auth/route-access.ts`** (pure):
   ```ts
   export type AccessDecision = { action: "next" } | { action: "redirect"; location: string };
   export function decideAccess(args: { pathname: string; search: string; hasUser: boolean }): AccessDecision
   ```
   Rules, in order:
   1. `pathname` starts with `/api/` → `next`.
   2. `pathname === "/login"` → `hasUser ? redirect "/" : next`.
   3. `!hasUser` → redirect `"/login"` when `pathname === "/"` and `search === ""`; otherwise redirect `` `/login?next=${encodeURIComponent(pathname + search)}` ``.
   4. Else `next`.

   Tests cover each rule, including `/chart/AAPL` → `/login?next=%2Fchart%2FAAPL` and `/api/candles/AAPL` without a user → `next`.
9. **`lib/supabase/proxy.ts`**: `export async function updateSession(request: NextRequest): Promise<NextResponse>`. It must not import any `server-only` module.
   1. Get the config with `getSupabasePublicConfig()`. On `ConfigError`, log `console.error("Missing env:", err.missing)` and return a 500:
      - for `/api/*`: `NextResponse.json({ error: { code: "config", message: "Server configuration is incomplete." } }, { status: 500 })`;
      - otherwise: `new NextResponse("Server configuration is incomplete.", { status: 500 })`.
   2. Copy Supabase's pattern exactly:
      - `let response = NextResponse.next({ request })`;
      - `createServerClient(url, key, { cookies: { getAll: () => request.cookies.getAll(), setAll(cookiesToSet, headers) { … } } })`, where `setAll`:
        - sets each cookie on `request.cookies`;
        - sets `response = NextResponse.next({ request })`;
        - sets each cookie with its options on `response.cookies`;
        - sets each `headers` entry on `response.headers`;
      - **then immediately** `const { data } = await supabase.auth.getClaims()`, with no code between them.
   3. Call `decideAccess({ pathname, search: request.nextUrl.search, hasUser: Boolean(data?.claims?.sub) })`.
   4. On `redirect`:
      - `const redirect = NextResponse.redirect(new URL(location, request.url))`;
      - copy every cookie: `for (const c of response.cookies.getAll()) redirect.cookies.set(c)`;
      - copy `Cache-Control`, `Expires` and `Pragma` if present;
      - return `redirect`.
   5. Otherwise return `response`.

   Tests mock `@supabase/ssr`'s `createServerClient`. The fake captures the cookie methods and returns `{ auth: { getClaims } }`. Use `new NextRequest("http://localhost/…")`. Cases:
   - logged out, `/chart/AAPL` → 307 with `location` ending `/login?next=%2Fchart%2FAAPL`;
   - logged out, `/api/watchlist` → passes through (not a redirect);
   - logged in, `/login` → redirect to `/`;
   - when the fake calls `setAll([{name:"sb-x-auth-token", value:"v", options:{path:"/"}}], {"Cache-Control":"private, no-store"})`, the returned response has that `Set-Cookie` and `Cache-Control`, **including on a redirect response**;
   - missing env → 500, with no env var value in the body.
10. **`proxy.ts`** (root):
    ```ts
    import { type NextRequest } from "next/server";
    import { updateSession } from "@/lib/supabase/proxy";
    export async function proxy(request: NextRequest) { return updateSession(request); }
    export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"] };
    ```
11. **`README.md`**: add an "Auth" section:
    - email + password, sign-ups disabled;
    - create the user in Dashboard → Authentication → Users → Add user (Auto Confirm);
    - required env vars.

**Done when:**
- `npm run build`, `npm run lint` and `npm test` pass; `npx tsc --noEmit` is clean. If the build output has a Proxy/Middleware line, record it. Either way, the dev curl check below proves the proxy runs.
- All new tests pass, and every Phase 1 test passes unchanged.
- `grep -rn "server-only" lib/supabase/proxy.ts lib/supabase/public-config.ts lib/config-error.ts lib/auth/route-access.ts lib/auth/next-path.ts` → no output.
- `grep -rln "process\.env" lib app components proxy.ts | grep -v '\.test\.ts$'` → only `lib/config-error.ts` (Phase 1's "only `lib/env.ts` reads `process.env`" check moves with `readEnv`).
- With O0 done, `npm run dev`:
  - `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:3000/chart/AAPL` → `307 …/login?next=%2Fchart%2FAAPL`;
  - `curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/_next/static/x.js` → not 307.
  - (`/login` will 404 until T2, which is fine.)

**Risks:**
- Code placed between `createServerClient` and `getClaims()` causes random logouts (Supabase warning). Keep the pattern verbatim.
- If Turbopack rejects `server-only` in the proxy graph, that is exactly why the proxy-side modules avoid it. Don't "fix" it by adding `server-only` there.
- Secrets: the proxy only ever sees the publishable key.
- Signing keys: if O0 recorded only legacy HS256 on the new project, `getClaims()` makes one Auth round trip per request instead of a local JWKS check. It still works and needs no code change; note it in PROGRESS.md under this task.

### P2-T2 – Login, logout, protected app shell, auth on the candles route
**Files:**
- Create:
  - `app/login/page.tsx`, `app/login/login-form.tsx`, `app/login/actions.ts`
  - `lib/auth/sign-in-error.ts` (+ `.test.ts`)
  - `app/(app)/layout.tsx`, `app/(app)/actions.ts`
  - `lib/http/json.ts` (+ `.test.ts`)
  - `lib/http/fetch-with-auth-retry.ts` (+ `.test.ts`)
- Move (`git mv`): `app/page.tsx` → `app/(app)/page.tsx`; `app/chart/[symbol]/page.tsx` → `app/(app)/chart/[symbol]/page.tsx`
- Change:
  - `app/api/candles/[symbol]/route.ts` (+ `route.test.ts`)
  - `lib/candles/api-types.ts`
  - `lib/symbol.ts` (+ test)
  - `components/chart-view.tsx`
  - `app/globals.css`

**Steps:**
1. **`lib/candles/api-types.ts`**: extend `ErrorCode` with `"unauthorized" | "invalid_body" | "duplicate" | "watchlist_full" | "not_us" | "not_in_watchlist" | "order_mismatch"`. That gives one shared `ErrorResponse` shape for every route.
2. **`lib/symbol.ts`**: add `invalidSymbolMessage(raw: string): string`, which returns the exact text currently inline in the candles route:
   ```ts
   `"${raw.slice(0, 20)}" isn't a valid ticker. Use 1–10 letters, digits, '.' or '-', e.g. AAPL.`
   ```
   Add a test.
3. **`lib/http/json.ts`**:
   - `jsonNoStore(body: unknown, status = 200): Response`;
   - `errorJson(status: number, code: ErrorCode, message: string, retryAfterSeconds: number | null = null): Response`. It sets `Cache-Control: no-store`, and `Retry-After` when the value isn't null.

   Tests cover headers and body.
4. **Candles route**: replace its local `errorResponse` with `errorJson`, and the success response with `jsonNoStore`. Use `invalidSymbolMessage`. Then add auth **as the first thing inside the existing outer `try`**, before symbol validation:
   - `const { user } = await getAuthContext()`.
   - A `ConfigError` → 500 `config`. Use the existing message and log only the missing names.
   - `!user` → `errorJson(401, "unauthorized", "Log in to load charts.")`.

   Then continue exactly as before. Update `route.test.ts`:
   - mock `@/lib/auth/session` (`getAuthContext` resolves `{ supabase: {}, user: { id: "u1", email: null } }` by default);
   - new cases: no user → 401, `no-store`, service not called; `getAuthContext` throws `ConfigError` → 500 `config`, with no variable name in the body.

   All 8 existing cases must still pass.
5. **`lib/http/fetch-with-auth-retry.ts`** (used by browser code; no server imports):
   ```ts
   export const AUTH_RETRY_DELAY_MS = 1000;
   export async function fetchWithAuthRetry(input: string, init?: RequestInit, deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> } = defaultDeps): Promise<Response>
   ```
   It fetches. On status 401 it sleeps `AUTH_RETRY_DELAY_MS` and fetches once more, then returns that response. Network errors propagate.

   Tests: 200 → 1 call; 401 then 200 → 2 calls, slept 1000; 401 then 401 → returns 401 after 2 calls.
6. **`components/chart-view.tsx`**:
   - Use `fetchWithAuthRetry` instead of `fetch`.
   - On a final 401, return a new state `{ kind: "login"; symbol }`, which renders `<div className="error" role="alert">Your session has expired. <a href={`/login?next=${encodeURIComponent(`/chart/${symbol}`)}`}>Log in again</a>.</div>`.

   Nothing else changes in this task (the event dispatch comes in T8).
7. **`lib/auth/sign-in-error.ts`**: `signInErrorMessage(status: number | undefined): string`:
   - `429` → `"Too many login attempts. Wait a few minutes and try again."`
   - `undefined`, or `>= 500` → `"Couldn't reach the login service. Try again shortly."`
   - anything else → `"Email or password is incorrect."`

   Add tests.
8. **`app/login/actions.ts`** (`"use server"`):
   ```ts
   export interface SignInState { error: string | null; email: string }
   export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState>
   ```
   1. `email = String(formData.get("email") ?? "").trim()`; `password = String(formData.get("password") ?? "")`; `next = safeNextPath(formData.get("next"))`.
   2. Either empty → `{ error: "Enter your email and password.", email }`.
   3. `createSupabaseServerClient()`. A `ConfigError` → `{ error: "Server configuration is incomplete.", email }`.
   4. `const { error } = await supabase.auth.signInWithPassword({ email, password })`. On `error` → `{ error: signInErrorMessage(error.status), email }`. Never log the email or password.
   5. `redirect(next)`, **outside any try/catch**.
9. **`app/login/login-form.tsx`** (`"use client"`):
   - `const [state, formAction, pending] = useActionState(signIn, { error: null, email: "" })`.
   - Form fields:
     - hidden `next`;
     - `email` (`type="email"`, `autoComplete="username"`, `required`, `defaultValue={state.email}`);
     - `password` (`type="password"`, `autoComplete="current-password"`, `required`);
     - submit button "Log in", which reads "Logging in…" and is disabled while `pending`.
   - `state.error` renders in `<div className="error" role="alert">`.
   - Labels are visible `<label>`s.
10. **`app/login/page.tsx`**:
    - `export const metadata = { title: "Log in – Market Charter" }`.
    - `async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> })` reads `next` (first value if an array), runs it through `safeNextPath`, and renders:
      - `<h1>Log in</h1>`;
      - `<p>Single-user app. Accounts are created by the owner.</p>`;
      - `<LoginForm next={next} />`.
    - No sign-up link.
11. **`app/(app)/actions.ts`** (`"use server"`): `export async function signOut(): Promise<void>` → `const supabase = await createSupabaseServerClient(); await supabase.auth.signOut(); redirect("/login");`.
12. **`app/(app)/layout.tsx`** (async Server Component):
    - `const { user } = await getAuthContext(); if (!user) redirect("/login");`
    - Render:
      ```tsx
      <div className="app-shell">
        <header className="app-header"><Link href="/">Market Charter</Link><span className="muted">{user.email}</span><form action={signOut}><button type="submit">Log out</button></form></header>
        <aside className="sidebar" aria-label="Watchlist"><h2>Watchlist</h2><p className="muted">Coming in P2-T8.</p></aside>
        <section className="content">{children}</section>
      </div>
      ```
13. **`app/(app)/page.tsx`**: keep the `<h1>`. Text: "Pick a ticker from your watchlist, or open the AAPL chart.", with the existing link.
14. **`app/globals.css`**:
    - **delete the first, duplicated `footer { … }` block** (keep the second);
    - `main { max-width: 1400px; }`;
    - add:
      - `.app-shell { display: grid; grid-template-columns: 260px 1fr; grid-template-areas: "header header" "sidebar content"; gap: 16px; }`
      - `.app-header { grid-area: header; display: flex; align-items: center; gap: 12px; } .app-header form { margin-left: auto; }`
      - `.sidebar { grid-area: sidebar; } .content { grid-area: content; min-width: 0; }`
      - `.muted { color: #666; font-size: 0.85rem; }`
      - `@media (max-width: 800px) { .app-shell { grid-template-columns: 1fr; grid-template-areas: "header" "sidebar" "content"; } }`
      - `.login-form { display: grid; gap: 8px; max-width: 320px; } .login-form input { padding: 6px 8px; }`

**Done when:**
- `npm run build` passes, with the routes `/`, `/chart/[symbol]`, `/login`, `/api/candles/[symbol]` and the proxy; lint and test pass; `tsc` is clean.
- The candles route's 8 old tests and 2 new ones pass. The `json`, `fetch-with-auth-retry` and `sign-in-error` tests pass.
- `git status` shows the two page files as renames.
- Dev server with `.env.local` (after O0):
  - logged out: `curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/candles/AAPL` → `401`;
  - `/login` → 200, and its HTML contains `Log in` and `autocomplete="current-password"`;
  - `/` → 307 to `/login`.
  - (A real login is proven in T9, after O2.)
- `grep -rn "signUp" app lib components` → no output.

**Risks:**
- `redirect()` inside `try` would be swallowed.
- The `(app)` layout runs `cookies()`, which makes every route dynamic. That's expected.
- Never log credentials.
- The Twelve Data budget: none used.

### P2-T3 – Provider: `searchSymbols` + US-listing rule
**Files:**
- Change:
  - `lib/data-provider/types.ts`
  - `lib/data-provider/twelve-data.ts` (+ `twelve-data.test.ts`)
  - `test/helpers/fake-provider.ts`
- Create:
  - `test/fixtures/twelve-data-symbol-search.json`
  - `lib/symbols/us-listing.ts` (+ `.test.ts`)

**Steps:**
1. **`types.ts`**: add
   ```ts
   export interface SymbolMatch { symbol: string; name: string | null; exchange: string | null; micCode: string | null; country: string | null; instrumentType: string | null; currency: string | null }
   ```
   and add to `DataProvider`:
   ```ts
   /** Ticker search (1 credit). Exact provider order (relevance). */
   searchSymbols(query: string): Promise<SymbolMatch[]>;
   ```
2. **`twelve-data.ts`** refactor, with the same behaviour for `getCandles`:
   - Extract `private async requestJson(path: string, params: URLSearchParams): Promise<RawResponse | null>`. It contains the current fetch (header, `cache: "no-store"`, timeout), the JSON parse and the whole error-code mapping.
   - Where the code now does `return []` for 400 "no data is available", `requestJson` returns `null`.
   - `getCandles` calls `requestJson("/time_series", params)` and maps `null → []`. All existing T4 tests must pass unchanged.
   - Add `data?: unknown` to `RawResponse`.
3. **`searchSymbols(query)`**:
   - `params = new URLSearchParams({ symbol: query, outputsize: "30" })`; `json = await this.requestJson("/symbol_search", params)`.
   - `null` → `[]`.
   - `!Array.isArray(json.data)` → `ProviderError("bad_response", "Data provider returned an unexpected response")`.
   - Map each item. If `symbol` is not a non-empty string, skip the item. Other fields are strings or `null`: `instrument_name→name`, `exchange`, `mic_code→micCode`, `country`, `instrument_type→instrumentType`, `currency`.
   - Keep the provider's order.
4. **Fixture `test/fixtures/twelve-data-symbol-search.json`** (synthetic; label it in a `_comment` key):
   - `{ "data": [ … ], "status": "ok" }` with:
     - AAPL / NASDAQ / XNGS / United States / Common Stock / USD;
     - AAPL / BMV / XMEX / Mexico / Common Stock / MXN;
     - APLE / NYSE / XNYS / United States / REIT / USD;
     - one item with no `symbol` (must be skipped).
5. **Tests (`twelve-data.test.ts`, new `describe("searchSymbols")`)**:
   - maps the fixture: 3 results, in order, with all fields;
   - the URL is exactly `/symbol_search` with the params `{symbol:"AAPL", outputsize:"30"}`, and the host is `api.twelvedata.com`;
   - the key is sent only in the `Authorization` header;
   - an HTTP 200 body `{status:"error", code:429}` → `rate_limited`;
   - `{status:"ok"}` without `data` → `bad_response`;
   - `{data: []}` → `[]`;
   - a 500 → `unavailable`;
   - error messages never contain the key or URL.
6. **`test/helpers/fake-provider.ts`**:
   - add `readonly searchCalls: string[] = []`, a separate `searchQueue` and `enqueueSearch(result: SymbolMatch[] | Error): this`;
   - `searchSymbols` records the call and returns or throws the next result (throws "FakeProvider: no queued search result" when empty);
   - optional `delayMs` applies as for `getCandles`.
7. **`lib/symbols/us-listing.ts`** (pure):
   ```ts
   export const US_MIC_CODES: ReadonlySet<string> = new Set(["XNAS","XNGS","XNMS","XNCM","XNYS","ARCX","BATS","XASE","IEXG"]);
   export const US_COUNTRY = "United States";
   export type UsListingResult = { kind: "us"; match: SymbolMatch } | { kind: "non_us"; exchanges: string[] } | { kind: "none" };
   export function pickUsListing(symbol: string, matches: SymbolMatch[]): UsListingResult
   export function summariseMatches(matches: SymbolMatch[], max = 5): string // "AAPL@NASDAQ(United States), AAPL@BMV(Mexico)" or "no matches"
   ```
   Algorithm: see Design decision 3. `exchanges` = unique `exchange ?? micCode ?? "unknown"`, first 3.

   Tests:
   - the fixture with "AAPL" → us / NASDAQ;
   - "aapl" input already normalised by caller (pass "AAPL");
   - only the Mexico item → `non_us` `["BMV"]`;
   - `[]` → none;
   - "APL" vs "APLE" → none (exact match only);
   - country null but mic XNYS → us;
   - two US hits, ETF then Common Stock → picks the Common Stock;
   - `summariseMatches` format and its 5-item cap.

**Done when:**
- build, lint and test pass; `tsc` is clean;
- every existing `twelve-data.test.ts` case passes untouched, plus the new ones;
- `grep -rn "symbol_search" app components` → no output (provider only).

**Risks:**
- The field names are partly unverified. The parser needs only `symbol`, and T4 logs a match summary on `not_found`, so T9 can diagnose with no extra credit.
- No network in tests.

### P2-T4 – Shared credit budget + logged, guarded US symbol check
**Files:**
- Create:
  - `lib/candles/messages.ts`
  - `lib/candles/credit-budget.ts` (+ `.test.ts`)
  - `lib/cache/complete-lease.ts`
  - `lib/symbols/check-us-symbol.ts` (+ `.test.ts`)
- Change:
  - `lib/candles/limits.ts`
  - `lib/cache/candle-store.ts`
  - `lib/candles/get-chart-candles.ts`
  - `test/helpers/memory-candle-store.ts`

**Steps:**
1. **`limits.ts`**: add `export const MAX_LOG_MESSAGE_LENGTH = 500;` and remove the local constant from `get-chart-candles.ts`.
2. **`messages.ts`**: move `minuteLimit`, `dayLimit`, `providerLimit` and `cacheUnavailable` (exact text) out of `get-chart-candles.ts` as `export const LIMIT_MESSAGES = { minute, day, provider } as const` and `export const CACHE_UNAVAILABLE_MESSAGE`. `get-chart-candles.ts` imports them, and all other messages stay where they are.
3. **`credit-budget.ts`**:
   ```ts
   export interface BudgetRefusal { kind: "minute" | "day"; message: string; retryAfterSeconds: number }
   export async function checkCreditBudget(store: Pick<CandleStore, "sumCreditsSince">, now: Date): Promise<BudgetRefusal | null>
   ```
   - It holds exactly today's logic: minute sum ≥ `CREDITS_PER_MINUTE` → `{minute, 60}`; day sum since UTC midnight ≥ `CREDITS_PER_DAY` → `{day, secondsUntilNextUtcMidnight}`.
   - Move `startOfUtcDay` and `secondsUntilNextUtcMidnight` here (exported).
   - Tests: 7 credits → null; 8 within 60 s → minute; 800 since midnight, spread wider → day, with the correct seconds at 17:00Z.
4. **`complete-lease.ts`**: move `completeLeaseBestEffort` from `get-chart-candles.ts` (same body) and export it.
5. **`get-chart-candles.ts`**: use `checkCreditBudget` (`refusal` → `limited(refusal.message, refusal.retryAfterSeconds)`), `completeLeaseBestEffort`, `LIMIT_MESSAGES` and `CACHE_UNAVAILABLE_MESSAGE`. **No behaviour change:** all 27 existing tests must pass untouched.
6. **`candle-store.ts`**:
   - `export type LogInterval = Interval | "symbol_search";`
   - change `acquireFetchLease(symbol: string, interval: LogInterval, now: Date)`.
   - No other signature changes. The Supabase implementation compiles as is, since `fetch_log.interval` is `string`.
   - `MemoryLogRow.interval` becomes `LogInterval`.
7. **`check-us-symbol.ts`** (`import "server-only"`):
   ```ts
   export type SymbolCheckResult =
     | { ok: true; match: SymbolMatch }
     | { ok: false; status: 404 | 422 | 429 | 502 | 503; error: { code: ErrorCode; message: string }; retryAfterSeconds: number | null };
   export async function checkUsSymbol(symbol: string, deps: { store: CandleStore; provider: DataProvider; now?: () => Date }): Promise<SymbolCheckResult>
   ```
   The symbol is already normalised. The whole body is wrapped so that a `StoreError` → 503 `cache_unavailable` (`CACHE_UNAVAILABLE_MESSAGE`, logged with `console.error`). Steps:
   1. `refusal = await checkCreditBudget(store, now)` → 429 `rate_limited` with the refusal's message and seconds. No log row, 0 provider calls.
   2. `leaseId = await store.acquireFetchLease(symbol, "symbol_search", now)`; `null` → 503 `busy`, ``${symbol} is already being checked. Try again in a moment.``, retry `BUSY_RETRY_SECONDS`.
   3. `matches = await provider.searchSymbols(symbol)`. On `ProviderError`, complete the lease with `creditsUsed: CREDITS_PER_CALL`, `candlesReceived: null` and the message cut to 500:
      - `rate_limited` → status `rate_limited` → 429 `LIMIT_MESSAGES.provider`, retry 60.
      - `not_found` → treat as `matches = []` and continue (don't close the lease yet).
      - `unavailable` → `error` → 502 `provider_unavailable`, `"Couldn't reach Twelve Data to check the ticker. Try again shortly."`
      - `forbidden` / `auth` / `bad_response` → `error` + `console.error` → 502 `provider_error`, `"Twelve Data returned an unexpected error while checking the ticker. Check the server logs."`
      - A non-`ProviderError` → close as `error` ("Unexpected data provider failure") and rethrow.
   4. `pick = pickUsListing(symbol, matches)`:
      - `us` → complete `ok` (message null) → `{ ok: true, match }`.
      - `non_us` → complete `not_found`, message `"non-US only: " + summariseMatches(matches)` → 422 `not_us`, ``${symbol} isn't listed on a US exchange (found on ${exchanges.join(", ")}). Only US tickers are supported.``
      - `none` → complete `not_found`, message `summariseMatches(matches)` → 404 `not_found`, ``No US-listed ticker "${symbol}" was found at Twelve Data.``
8. **Tests (`check-us-symbol.test.ts`;** MemoryCandleStore + FakeProvider + fixed clock). Each asserts `provider.searchCalls.length` and `store.logRows()`:
   1. US hit → ok, 1 call, 1 row `{interval:"symbol_search", status:"ok", creditsUsed:1}`.
   2. None → 404 `not_found`, row `not_found` whose message contains "no matches" or the summary.
   3. Non-US → 422 `not_us`, message names BMV, row `not_found`.
   4. Provider `not_found` error → 404 (treated as no matches), 1 row `not_found`.
   5. Minute budget full (seeded 8 credits) → 429, 0 calls, no new row.
   6. Provider 429 → 429, row `rate_limited`, credits 1.
   7. Lease held (pending `symbol_search` row 10 s old) → 503 busy, 0 calls.
   8. A pending **`1day`** lease for the same symbol does **not** block the search (independent series).
   9. Unavailable → 502 `provider_unavailable`; bad_response → 502 `provider_error`.
   10. `failNext("sumCreditsSince")` → 503 `cache_unavailable`, 0 calls.
   11. A search row `ok` does not make `getLastOkFetchAt(symbol, "1day")` non-null.

**Done when:**
- all new tests pass, and **all 27 `get-chart-candles` tests and the store contract pass unchanged**;
- build, lint and test pass; `tsc` is clean;
- `grep -n "sumCreditsSince" lib/candles/get-chart-candles.ts` → no output (it goes through `checkCreditBudget`);
- `grep -rn "Twelve Data's free-plan limit" lib` → exactly 1 hit (`messages.ts`).

**Risks:**
- This is a refactor of approved Phase 1 code. The unchanged tests are the safety net, so don't edit them.
- The budget race across instances is unchanged (accepted in Phase 1).
- Search credits are logged as 1, which is conservative.

### P2-T5 – Recent candles read, quote maths, display formatters
**Files:**
- Change:
  - `lib/cache/candle-store.ts`
  - `lib/cache/supabase-candle-store.ts` (+ `.test.ts`)
  - `test/helpers/memory-candle-store.ts`
  - `test/helpers/candle-store-contract.ts`
- Create:
  - `lib/watchlist/api-types.ts`
  - `lib/watchlist/quote.ts` (+ `.test.ts`)
  - `lib/watchlist/format.ts` (+ `.test.ts`)

**Steps:**
1. **`CandleStore`**: add `/** Last `count` candles, ascending by ts. */ getRecentCandles(symbol: string, interval: Interval, count: number): Promise<Candle[]>;`.
   - **Supabase:** select `ts,open,high,low,close,volume`, `.eq` symbol and interval, `.order("ts", { ascending: false }).limit(count)`, map as in `getCandles`, then reverse. An error → `StoreError("Supabase getRecentCandles failed: …")`.
   - **Memory:** the last `count` of the sorted series; also uses `enter("getRecentCandles")`.
   - **Unit test** (fake fetch): the URL has `order=ts.desc` and `limit=2`; the result comes back ascending; an error → `StoreError`.
   - **Contract case:** seed 3 candles; `getRecentCandles(…, 2)` → the last two, ascending; an unknown series → `[]`.
2. **`lib/watchlist/api-types.ts`** (types only):
   ```ts
   /** asOf = UTC seconds of the last cached daily bar. changePct in percent (1.5 = +1.5%). */
   export interface WatchlistQuote { lastClose: number; prevClose: number | null; changePct: number | null; asOf: number; stale: boolean }
   export interface WatchlistItem { symbol: string; quote: WatchlistQuote | null }
   export interface WatchlistResponse { items: WatchlistItem[] }
   export interface WatchlistItemResponse { item: WatchlistItem }
   export interface WatchlistRefreshResponse { item: WatchlistItem; source: "cache" | "api"; notice: Notice | null }
   ```
3. **`quote.ts`**: `toQuote(recent: Candle[], lastOkFetchAt: Date | null, now: Date): WatchlistQuote | null`:
   - `[]` → `null`;
   - `last = recent.at(-1)`, `prev = recent.length > 1 ? recent.at(-2) : null`;
   - `changePct = prev && prev.close !== 0 ? ((last.close - prev.close) / prev.close) * 100 : null`;
   - `asOf = Date.parse(last.ts) / 1000`;
   - `stale = !isDailyCacheFresh({ latestCachedTs: last.ts, lastOkFetchAt, now })`.

   Tests:
   - 100 → 102 → +2;
   - 50 → 49 → −2;
   - a single candle → `prevClose` and `changePct` null;
   - a previous close of 0 → `changePct` null;
   - the stale flag on both sides of the 18:00 ET cutoff, using Phase 1's NZ example dates;
   - the holiday clause (an ok fetch after the cutoff) → not stale.
4. **`format.ts`** (browser-safe):
   - `formatPrice(v: number): string` → `Intl.NumberFormat("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 })`.
   - `formatChangePct(pct: number | null): string` → `null` gives `"—"`; otherwise `Intl.NumberFormat("en-NZ", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(pct / 100)`.
   - `changeClass(pct: number | null): "up" | "down" | "flat"`.

   Tests (normalise whitespace): `212.4` → `"212.40"`; `0.12345` → `"0.1235"`; `1234.5` → `"1,234.50"`; `1.234` → `"+1.23%"`; `-0.456` → `"-0.46%"` (accept U+2212 by normalising); `0` → `"0.00%"`; `null` → `"—"`.

**Done when:**
- build, lint and test pass;
- the contract passes against the memory store; the Supabase integration contract runs in T9;
- `quote.ts` imports nothing from `server-only` modules.

**Risks:**
- "Last price" is the last **completed** close, by design (Phase 1 never caches the in-progress bar). The UI labels it with its date.

### P2-T6 – Watchlist store (RLS-scoped) + watchlist service
**Files:**
- Create:
  - `lib/watchlist/limits.ts`
  - `lib/watchlist/watchlist-store.ts`
  - `lib/watchlist/supabase-watchlist-store.ts` (+ `.test.ts`)
  - `test/helpers/memory-watchlist-store.ts`
  - `lib/watchlist/watchlist-service.ts` (+ `.test.ts`)

**Steps:**
1. **`limits.ts`**: `MAX_WATCHLIST_ITEMS = 30`, `REFRESH_PACE_MS = 10_000`, `REFRESH_BUSY_RETRY_MS = 3_000`, `MAX_REFRESH_BUSY_RETRIES = 3`.
2. **`watchlist-store.ts`**:
   ```ts
   export interface WatchlistRow { symbol: string; sortOrder: number }
   export interface WatchlistStore {
     /** Current user's rows, ordered by sort_order then created_at. */
     list(): Promise<WatchlistRow[]>;
     insert(symbol: string, sortOrder: number): Promise<"ok" | "duplicate">;
     /** false when no row was deleted. */
     remove(symbol: string): Promise<boolean>;
     setSortOrders(updates: WatchlistRow[]): Promise<void>;
   }
   ```
   Errors throw `StoreError` (reuse from `lib/cache/candle-store.ts`).
3. **`supabase-watchlist-store.ts`** (`import "server-only"`): `createSupabaseWatchlistStore(client: SupabaseClient<Database>)` (use T1's alias if one was needed). **The client must be the user-scoped server client**, never the admin client.
   - `list`: `.from("watchlist").select("symbol,sort_order").order("sort_order").order("created_at")`.
   - `insert`: `.insert({ symbol, sort_order })` with no `user_id` (the default is `auth.uid()`). Error code `23505` → `"duplicate"`; other errors → `StoreError`.
   - `remove`: `.delete().eq("symbol", symbol).select("symbol")` → `data.length > 0`.
   - `setSortOrders`: `Promise.all(updates.map(u => .update({ sort_order: u.sortOrder }).eq("symbol", u.symbol)))`. The first error → `StoreError`.

   Unit tests (fake fetch, like `supabase-candle-store.test.ts`):
   - the list URL has `order=sort_order.asc,created_at.asc`;
   - the insert body has no `user_id`;
   - 23505 → `"duplicate"`;
   - delete returns true or false by the rows returned;
   - `setSortOrders` sends one PATCH per update, filtered on `symbol`;
   - a 500 → `StoreError`.
4. **`memory-watchlist-store.ts`**: same semantics, with `failNext(method)` and a `rows()` helper.
5. **`watchlist-service.ts`** (`import "server-only"`):
   ```ts
   export interface WatchlistDeps { watchlist: WatchlistStore; candles: CandleStore; provider: DataProvider; now?: () => Date }
   export type WatchlistFailure = { ok: false; status: 400 | 404 | 409 | 422 | 429 | 502 | 503; error: { code: ErrorCode; message: string }; retryAfterSeconds: number | null };
   listWatchlist(deps): Promise<{ ok: true; items: WatchlistItem[] } | WatchlistFailure>
   addToWatchlist(raw: unknown, deps): Promise<{ ok: true; item: WatchlistItem } | WatchlistFailure>
   removeFromWatchlist(raw: unknown, deps): Promise<{ ok: true } | WatchlistFailure>
   reorderWatchlist(symbols: unknown, deps): Promise<{ ok: true } | WatchlistFailure>
   refreshWatchlistSymbol(raw: unknown, deps): Promise<{ ok: true; item: WatchlistItem; source: "cache" | "api"; notice: Notice | null } | WatchlistFailure | ChartCandlesFailure>
   ```
   - Private `readQuote(symbol, deps, now)` = `toQuote(await candles.getRecentCandles(symbol, "1day", 2), await candles.getLastOkFetchAt(symbol, "1day"), now)`.
   - Every function catches `StoreError` → 503 `cache_unavailable` (`CACHE_UNAVAILABLE_MESSAGE`), logged.
   - **Symbol parsing:** `raw` must be a string of ≤ 20 chars and pass `normaliseSymbol`. Otherwise:
     - `addToWatchlist` → 400 `invalid_symbol` with `invalidSymbolMessage(String(raw ?? ""))`;
     - `removeFromWatchlist` → 400 `invalid_symbol` likewise;
     - `refreshWatchlistSymbol` → 400 `invalid_symbol` likewise.
   - **list:** `rows = watchlist.list()`; `items = await Promise.all(rows.map(r => ({ symbol, quote: readQuote(...) })))`.
   - **add**, in order (stop at the first failure):
     1. Parse the symbol.
     2. `rows = list()`. Already present → 409 `duplicate`, ``${S} is already in your watchlist.``
     3. `rows.length >= MAX_WATCHLIST_ITEMS` → 409 `watchlist_full`, ``Your watchlist is full (${MAX} tickers). Remove one first.``
     4. `check = checkUsSymbol(S, { store: candles, provider, now })`. A failure is returned as is (its status and code are within `WatchlistFailure`).
     5. `insert(S, rows.length ? Math.max(...sortOrders) + 1 : 0)`. `"duplicate"` → 409 `duplicate` (race).
     6. `{ ok: true, item: { symbol: S, quote: await readQuote(S) } }`.
   - **remove:** parse; `remove(S)` false → 404 `not_in_watchlist`, ``${S} isn't in your watchlist.``
   - **reorder:**
     1. `symbols` must be an array of ≤ `MAX_WATCHLIST_ITEMS` strings, each passing `normaliseSymbol` to the same value with no duplicates. Otherwise 400 `invalid_body`, `"Request body is not valid."`
     2. `rows = list()`. If the lengths differ or any symbol is missing → 409 `order_mismatch`, `"Your watchlist changed somewhere else. Reload and try again."`
     3. `updates` = entries whose index ≠ current `sortOrder`; `setSortOrders(updates)` (skipped when empty).
   - **refresh:**
     1. Parse.
     2. Not in `list()` → 404 `not_in_watchlist` (0 provider calls).
     3. `r = await getChartCandles(S, "1day", { store: candles, provider, now })`.
     4. `!r.ok` → return `r` (a `ChartCandlesFailure`).
     5. Otherwise `item = { symbol: S, quote: toQuote(r.candles.slice(-2), await candles.getLastOkFetchAt(S, "1day"), now) }` → `{ ok: true, item, source: r.source, notice: r.notice }`.
6. **`watchlist-service.test.ts`** (MemoryWatchlistStore + MemoryCandleStore + FakeProvider + fixed clock; synthetic candles; **use a distinct symbol per test** because `getChartCandles` keeps a module-level in-flight map):
   1. list: a cached ticker (two candles) has a quote; a cold ticker has `quote: null`; the stale flag is set; order follows `sortOrder`.
   2. add happy: 1 search call, `sortOrder = max+1`, item returned with its cached quote; **0 `getCandles` provider calls**.
   3. add invalid `"a;b"` / `42` / a 21-char string → 400, 0 calls.
   4. duplicate → 409, 0 calls.
   5. full (30 rows) → 409, 0 calls.
   6. not found → 404, nothing inserted.
   7. non-US → 422, nothing inserted.
   8. budget full → 429 with `retryAfterSeconds` 60, nothing inserted.
   9. insert race (`insert` returns `"duplicate"`) → 409.
   10. remove ok / missing → 404.
   11. reorder: `[C,A,B]` from `[A,B,C]` → `setSortOrders` gets only the changed rows, and `list()` then reads C, A, B.
   12. reorder mismatch (an extra or missing symbol) → 409.
   13. reorder bad body (not an array, duplicates, invalid symbol) → 400.
   14. refresh: not in the list → 404, 0 calls; cold → 1 `getCandles` call with `from` undefined, `source:"api"`, quote from the last 2; fresh cache → 0 calls, `source:"cache"`.
   15. `failNext("list")` → 503 `cache_unavailable`.

**Done when:**
- all new tests pass; build, lint and test pass; `tsc` is clean;
- `grep -rn "createSupabaseAdminClient" lib/watchlist` → no output (the watchlist never uses the secret key).

**Risks:**
- RLS is the real guard. `user_id` is never taken from input.
- `Promise.all` updates aren't atomic. A partial failure leaves a mixed order but no lost rows, and the client reloads on error.
- 2 cache queries per row (≤ 60 for 30 rows) is acceptable for one user.

### P2-T7 – Watchlist API routes
**Files:**
- Create:
  - `lib/watchlist/deps.ts`
  - `app/api/watchlist/route.ts` (+ `route.test.ts`)
  - `app/api/watchlist/refresh/route.ts` (+ `route.test.ts`)

**Steps:**
1. **`lib/watchlist/deps.ts`** (`import "server-only"`): `buildWatchlistDeps(supabase): WatchlistDeps` → `{ watchlist: createSupabaseWatchlistStore(supabase), candles: createSupabaseCandleStore(createSupabaseAdminClient()), provider: getDataProvider() }`. It may throw `ConfigError`.
2. **Common flow** for every handler (`export const dynamic = "force-dynamic"`):
   1. In an outer try: `const { supabase, user } = await getAuthContext()`.
   2. `!user` → `errorJson(401, "unauthorized", "Log in to use the watchlist.")`.
   3. `deps = buildWatchlistDeps(supabase)`.
   4. A `ConfigError` anywhere here → log the missing names → 500 `config`, `"Server configuration is incomplete."`
   5. A JSON body is read with `await request.json()` in its own try. A failure, or a non-object → 400 `invalid_body`.
   6. A service failure → `errorJson(f.status, f.error.code, f.error.message, f.retryAfterSeconds)`.
   7. Any other throw → log `err.message` only → 500 `provider_error`, `"Something went wrong with the watchlist. Check the server logs."`
3. **`app/api/watchlist/route.ts`**:
   - `GET` → `listWatchlist` → `jsonNoStore({ items } satisfies WatchlistResponse)`.
   - `POST` body `{ symbol }` → `addToWatchlist(body.symbol)` → `jsonNoStore({ item } satisfies WatchlistItemResponse, 201)`.
   - `DELETE` `?symbol=` → `removeFromWatchlist(searchParams.get("symbol"))` → `new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } })`.
   - `PATCH` body `{ symbols }` → `reorderWatchlist(body.symbols)` → `jsonNoStore({ items })`, re-listing after the save so the client gets the truth.
4. **`app/api/watchlist/refresh/route.ts`**: `POST` body `{ symbol }` → `refreshWatchlistSymbol` → `jsonNoStore({ item, source, notice } satisfies WatchlistRefreshResponse)`. A `ChartCandlesFailure` maps through the same `errorJson`, including `Retry-After`.
5. **Tests** (mock `@/lib/auth/session`, `@/lib/watchlist/deps`, `@/lib/watchlist/watchlist-service`, following the Phase 1 route-test pattern):
   - Each method with no user → 401, `no-store`, service not called.
   - `ConfigError` from deps → 500 `config`, with no var name in the body.
   - GET 200 shape; POST 201; POST bad JSON → 400 `invalid_body`.
   - POST 429 failure → status 429 + `Retry-After: 60`.
   - DELETE 204; DELETE missing → 404 body.
   - PATCH 200 returns the items; PATCH 409 passes through.
   - refresh 200 with `source`/`notice`; refresh 503 busy → `Retry-After: 3`.
   - An unexpected throw → generic 500 with no stack.

**Done when:**
- `npm run build` lists `ƒ /api/watchlist` and `ƒ /api/watchlist/refresh`; lint and test pass; `tsc` is clean.
- Dev, logged out: `curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/watchlist` → `401`, and `-X POST …/api/watchlist/refresh` → `401`.

**Risks:**
- The routes are thin; all the logic is tested in T6.
- 204 must not carry a body.
- The `refresh` route is the only new place that spends candle credits, and only for the user's own tickers.

### P2-T8 – Sidebar UI: API client, paced refresh queue, watchlist component
**Files:**
- Create:
  - `lib/watchlist/client.ts` (+ `.test.ts`)
  - `lib/watchlist/refresh-queue.ts` (+ `.test.ts`)
  - `lib/watchlist/events.ts`
  - `components/watchlist-sidebar.tsx`
- Change:
  - `app/(app)/layout.tsx`
  - `components/chart-view.tsx`
  - `app/globals.css`

**Steps:**
1. **`events.ts`**: `export const CANDLES_UPDATED_EVENT = "market-charter:candles-updated";`.
2. **`client.ts`** (browser-safe; uses `fetchWithAuthRetry`):
   ```ts
   export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: ErrorCode | null; message: string };
   export function createWatchlistClient(deps = { fetch, sleep }) {
     return { list(), add(symbol), remove(symbol), saveOrder(symbols), refresh(symbol) } // each returns Promise<ApiResult<…>>
   }
   export type RefreshOutcome =
     | { kind: "fetched" | "cached"; item: WatchlistItem }
     | { kind: "busy" }
     | { kind: "limited"; message: string; item: WatchlistItem | null }
     | { kind: "failed"; message: string }
     | { kind: "unauthorized" };
   export function toRefreshOutcome(r: ApiResult<WatchlistRefreshResponse>): RefreshOutcome
   ```
   - Requests:
     - `list` → GET `/api/watchlist`;
     - `add` → POST `{symbol}`;
     - `remove` → DELETE `?symbol=${encodeURIComponent(s)}` (204 → `data: null`);
     - `saveOrder` → PATCH `{symbols}`;
     - `refresh` → POST `/api/watchlist/refresh`.
     - All send `Content-Type: application/json` where there's a body.
   - Error mapping:
     - network throw → `{ok:false, status:0, code:null, message:"Couldn't reach the server."}`;
     - final 401 → `code "unauthorized"`, message `"Your session has expired. Log in again."`;
     - other non-OK → the body's `error.code`/`message`, falling back to `"Something went wrong. Try again."`;
     - unparsable OK body → `status 0`, `"Unexpected response from the server."`
   - `toRefreshOutcome`:
     - ok + `notice?.code === "rate_limited"` → `limited` (with item);
     - ok + `notice?.code === "busy"` → `busy`;
     - ok + `source === "api"` → `fetched`;
     - ok + other notice → `failed` with `notice.message`;
     - ok + no notice → `cached`;
     - status 429 → `limited`;
     - 503 with code `busy` → `busy`;
     - 401 → `unauthorized`;
     - anything else → `failed`.

   Tests cover every branch, with a fake fetch.
3. **`refresh-queue.ts`** (pure, injected deps):
   ```ts
   export interface RefreshQueueDeps {
     refresh(symbol: string): Promise<RefreshOutcome>;
     sleep(ms: number): Promise<void>;
     isCancelled(): boolean;
     onItem(item: WatchlistItem): void;
     onProgress(done: number, total: number): void;
   }
   export type QueueEnd = { status: "done" | "cancelled" | "unauthorized"; message: null } | { status: "limited"; message: string };
   export async function runRefreshQueue(queue: string[], deps: RefreshQueueDeps): Promise<QueueEnd>
   ```
   - Loop `for (let i = 0; i < queue.length; i++)`, re-reading `queue.length` each time so symbols appended while it runs are picked up.
   - Before each item, `isCancelled()` → `cancelled`.
   - Call `refresh`:
     - `fetched` → `onItem`, then `sleep(REFRESH_PACE_MS)` (skipped after the last item);
     - `cached` → `onItem`, no sleep;
     - `busy` → `sleep(REFRESH_BUSY_RETRY_MS)` and retry the same symbol, up to `MAX_REFRESH_BUSY_RETRIES`, then skip;
     - `failed` → skip, then `sleep(REFRESH_PACE_MS)` (a credit may have been spent);
     - `limited` → `onItem(item)` if there's an item, then return `{status:"limited", message}`;
     - `unauthorized` → return `unauthorized`.
   - Call `onProgress(i + 1, queue.length)` after each symbol.

   Tests (fake sleep that records ms):
   - 3 fetched → sleeps `[10000, 10000]`;
   - cached items → no sleeps;
   - busy twice then fetched → sleeps `[3000, 3000]` then success;
   - busy 4 times → skipped after 3 retries;
   - limited on the 2nd → stops, the 3rd is never refreshed;
   - unauthorized stops;
   - a symbol appended during the 1st refresh gets processed;
   - cancelled before the 2nd → stops.
4. **`components/watchlist-sidebar.tsx`** (`"use client"`). State:
   - `items: WatchlistItem[]`;
   - `loadState: "loading" | "ready" | "error"`;
   - `message: { kind: "error" | "status"; text: string; login?: boolean } | null`;
   - `queueStatus: { running: boolean; done: number; total: number; paused: string | null }`;
   - `input`, `adding`.

   Behaviour:
   - **Mount:** `client.list()`. Set state only after the await. On success, start the queue with the symbols where `quote === null || quote.stale`.
   - **Queue:** keep one queue at a time.
     - The `queueRef` array plus a `runningRef` flag.
     - `enqueue(symbols)` appends symbols not already in `queueRef` and starts `runRefreshQueue` if it isn't running.
     - `onItem` merges the item into `items` by symbol.
     - At the end: `limited` → `queueStatus.paused = message`; `unauthorized` → `message` with `login: true`.
     - On unmount, set the cancel flag.
   - **Add form:**
     - `<form>` with `<label>` "Add ticker", `<input name="symbol" maxLength={10} autoComplete="off">` and a button "Add" ("Checking…" while `adding`).
     - On submit: `client.add(input)`.
       - ok → append the item, clear the input, `message = { kind: "status", text: `${symbol} added.` }`, and `enqueue([symbol])` if its quote is null or stale.
       - fail → `message = { kind: "error", text: r.message }` (plus a `login` link on 401).
   - **Rows** (`<ol className="watchlist">`). Each `<li>`, with `aria-current="page"` when `usePathname() === `/chart/${symbol}``, contains:
     - `<Link href={`/chart/${symbol}`}>{symbol}</Link>`;
     - with a quote:
       - `<span className="price">{formatPrice(lastClose)}</span>`;
       - `<span className={`change ${changeClass(changePct)}`}>{formatChangePct(changePct)}</span>`;
       - `<span className="muted">{formatNzDate(asOf)}{stale ? " · updating…" : ""}</span>`;
     - without a quote: `<span className="muted">Not loaded yet</span>`;
     - buttons with `aria-label`s `Move ${symbol} up` (disabled on the first row), `Move ${symbol} down` (disabled on the last) and `Remove ${symbol}`.
   - **Reorder:** swap optimistically, then `client.saveOrder(newSymbols)`.
     - ok → `items` takes the server's order, mapping quotes by symbol.
     - 409 → reload via `client.list()` and show its message.
     - other failure → revert, then show the message.
   - **Remove:** remove optimistically, then `client.remove`. A failure restores the previous list and shows the message.
   - **Status line** under the heading (`role="status"`):
     - running → `Updating prices… (${done} of ${total})`;
     - paused → `Paused: ${paused} ` plus a `<button>` "Retry", which re-enqueues the remaining stale or cold symbols;
     - otherwise nothing.
   - **Header row:** `<p className="muted">Last close (USD) · day change</p>`.
   - **Empty list:** `<p className="muted">No tickers yet. Add one above, e.g. AAPL.</p>`.
   - **`CANDLES_UPDATED_EVENT`:** a `window` listener calls `client.list()` and merges the quotes (it does not restart the queue). Remove the listener on unmount.
5. **`app/(app)/layout.tsx`**: replace the placeholder `<aside>` content with `<WatchlistSidebar />`, keeping `<aside className="sidebar" aria-label="Watchlist">`.
6. **`components/chart-view.tsx`**: in the effect, after `setState(next)`, if `next.kind === "ready" && next.data.source === "api"`, call `window.dispatchEvent(new Event(CANDLES_UPDATED_EVENT))`.
7. **CSS**:
   - `.watchlist { list-style: none; padding: 0; margin: 0; } .watchlist li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 6px 4px; border-bottom: 1px solid #eee; }`
   - `.watchlist li[aria-current="page"] { background: #eef4ff; }`
   - `.watchlist .actions { grid-column: 1 / -1; display: flex; gap: 4px; }`
   - `.up { color: #137333; } .down { color: #c5221f; } .flat { color: #555; }`
   - `.price, .change { font-variant-numeric: tabular-nums; text-align: right; }`

**Done when:**
- build, lint and test pass, with the client and queue tests green; `tsc` is clean;
- `grep -rn "twelvedata\|SUPABASE_SECRET\|TWELVE_DATA" components lib/watchlist/client.ts lib/watchlist/refresh-queue.ts` → no output;
- the dev server renders (after O2, logged in by hand or in T9); the full UI proof is T9.

**Risks:**
- The `react-hooks/set-state-in-effect` lint rule: start async work in the effect and set state only after awaits.
- If two tabs each run a queue, they could exceed 6/min combined. The budget guard stops them both with a clear message (accepted).
- Optimistic updates must restore state on failure.
- **A ticker that never becomes fresh** (e.g. it was added, then a refresh returns `forbidden` or `not_found`) is retried by the queue on every full page load, costing 1 credit each time. This is the same trade-off Phase 1 accepted for charts; the budget guard still caps the total.
- **Pacing applies within one queue run only.** The 10 s pause is skipped after the last item, so adding cold tickers one after another by hand spends 2 credits per add (search + backfill) with no pause between adds. The shared budget guard still refuses at 8/min. T9 paces its own adds (see T9).
- **Size:** this is the largest task. If its first code review runs long, the Executor may land it as **P2-T8a** (steps 1–3: `events.ts`, `client.ts`, `refresh-queue.ts` and their tests) and **P2-T8b** (steps 4–7: sidebar, layout, `chart-view` hook, CSS), each with the "Done when" checks that apply to it.

### P2-T9 – Live acceptance proof (orchestrator steps O0, O2 and O3 done first)
No code, except fixes the proof exposes, which go back through review. Use `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` for every Node process. Run Playwright with the global install (`/opt/node22/bin/playwright`, Chromium) from a script in the session scratchpad, **not committed**. Save screenshots to `docs/evidence/p2-t9-*.png`, and record every output and SQL result in PROGRESS.md. SQL checks run through `POST /v1/projects/$ref/database/query` (ref derived as above) or a Node one-off with the secret key.

**The cache starts empty.** The new project has no candles, so AAPL, MSFT and NVDA are all cold. Expect 3 backfills (1 credit each), on top of the 4 searches.

**Before starting:**
- **Credit baseline.** Note `select count(*), coalesce(sum(credits_used),0) from fetch_log where created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')` (expected `0, 0` on the new project). Twelve Data counts credits **per API key**, not per project. Credits already spent today on the same key (e.g. logged in the deleted project, or any unlogged key check) are **invisible to the budget guard**. Record them separately as "earlier spend today, not in `fetch_log`": take the figure from PROGRESS.md for the current UTC day, or write "unknown" if there's none. The day total for step 14 = new `fetch_log` total + that figure.
- **Timing.** Don't start within 45 minutes before 18:00 New York time (23:00 UTC; 12:00 NZDT). A run that straddles the cutoff turns the three fresh backfills stale, and the queue would spend up to 3 more credits in step 10.
- **Pacing in the script.** Wait until **20 s** have passed since the previous credit-spending action before each of these: the step 4 chart open, each add in step 5, and the ZZZZQX add in step 6. This keeps the peak at about 4 credits a minute, well under 8.

**Steps:**
1. `set -a; . ./.env.local; set +a; RUN_SUPABASE_TESTS=1 npm test` → everything passes, including the `getRecentCandles` contract case against the real database (0 Twelve Data credits). Then `npm run lint && npm run build && npm start`.
2. **Logged-out gate** (curl):
   - `/` → 307 `/login`;
   - `/chart/AAPL` → 307 `/login?next=%2Fchart%2FAAPL`;
   - `/api/candles/AAPL` → 401 JSON;
   - `/api/watchlist` → 401;
   - `POST /api/watchlist/refresh` → 401;
   - `/login` → 200.
   - The `fetch_log` count is unchanged.
3. **Sign-ups refused:** `curl -s -X POST "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/signup" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" -d '{"email":"stranger@example.com","password":"Str4nger-pass-123"}'` → an error (signups disabled). Record the HTTP code and message. SQL: no `stranger@example.com` in `auth.users`.
4. **Login (Playwright, desktop 1280×800):**
   - `/login` with a wrong password → the alert "Email or password is incorrect."
   - The right credentials (`E2E_USER_*`) → land on `/`, and the header shows the email. The sidebar shows the empty-list text.
   - **Screenshot `p2-t9-login-error.png`** (taken on the wrong-password attempt).
   - Then open `/chart/AAPL` directly. **The cache is empty, so this backfills AAPL (1 credit):** the chart renders with "Source: Twelve Data (just fetched)".
   - SQL: one `AAPL / 1day / ok / credits_used 1` row; `select count(*) from candles where symbol='AAPL' and "interval"='1day'` > 0 (record it; Phase 1 got 5000).
5. **Add** in the sidebar (note `<step-start>` = `now()` first):
   - `AAPL` → AAPL was cached by step 4 and is fresh, so the row shows price, %, date and **no** "Not loaded yet" straight away. The queue does nothing for it.
   - `MSFT` (cold) → appears with "Not loaded yet", the status line shows "Updating prices…", and within 30 s the row shows a price.
   - `NVDA` (cold) → same as MSFT.
   - SQL: `select symbol, "interval", status, credits_used, message from fetch_log where created_at > <step-start> order by id` → exactly, in this order: `AAPL symbol_search ok`, `MSFT symbol_search ok`, `MSFT 1day ok`, `NVDA symbol_search ok`, `NVDA 1day ok`. Each has `credits_used 1`. **No `AAPL 1day` row** after step-start.
   - `select symbol, count(*) from candles where "interval"='1day' and symbol in ('AAPL','MSFT','NVDA') group by symbol` → 3 rows, each > 0.
6. **Rejects:**
   - `ZZZZQX` → the alert `No US-listed ticker "ZZZZQX" was found at Twelve Data.`, plus a `symbol_search not_found` row whose message has the match summary;
   - `AAPL` again → "AAPL is already in your watchlist." with **no** new `fetch_log` row;
   - `a;b` → the invalid-ticker message with **no** row.
   - **Screenshot `p2-t9-sidebar-desktop.png`.**
7. **Sidebar values vs the cache:**
   - SQL: `select symbol, ts, close from (select symbol, ts, close, row_number() over (partition by symbol order by ts desc) rn from candles where "interval"='1day' and symbol in ('AAPL','MSFT','NVDA')) s where rn <= 2 order by symbol, ts`.
   - Compute (last − prev) / prev × 100 and compare with the displayed price and % (2 dp) and date for each ticker. Record both.
8. **Reorder:**
   - click "Move NVDA up" twice → order NVDA, AAPL, MSFT;
   - reload → the same order;
   - SQL `select symbol, sort_order from watchlist order by sort_order` → matches;
   - `user_id` = the e2e user's id for all rows.
9. **Remove** MSFT → gone; reload → still gone; SQL → 2 rows.
10. **Cache-only reads:**
    - note the `fetch_log` count (expected 7 on the new project: steps 4–6);
    - reload `/` 3 times and open `/chart/AAPL` from the sidebar;
    - the count is unchanged (all three tickers were backfilled in steps 4–5 and are fresh, so the queue is idle and the chart loads with "Source: Supabase cache").
    - Playwright request log: only same-origin requests (`/`, `/chart/AAPL`, `/api/watchlist`, `/api/candles/AAPL`, `/_next/…`); none to `twelvedata.com` or `supabase.co` from the browser.
11. **RLS:**
    - `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/watchlist?select=*" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"` (no user JWT) → permission denied or `[]`, and never the e2e rows;
    - SQL `select relname, relrowsecurity from pg_class where relname in ('watchlist','candles','fetch_log','indicator_prefs')` → all `true`.
12. **Phone layout:** 390×844, logged in → the sidebar stacks above the content. **Screenshot `p2-t9-sidebar-phone.png`.**
13. **Logout:** click "Log out" → on `/login`; open `/chart/AAPL` → redirected to `/login?next=…`.
14. **Credits:** re-run the day-total SQL; record the Phase 2 spend (expected 7), the earlier-spend figure from "Before starting", their sum, and the peak per minute (from `created_at`; expected ≤ 4).

**Done when:**
- steps 1–14 are recorded with outputs and screenshots, and every acceptance box can be ticked;
- the credits spent match the estimate below (7 expected, ≤ 15).

**Risks:**
- Credits are spent only as listed; don't add more tickers to "see more".
- Don't delete cache or log rows.
- Every ticker starts cold, so a step re-run after a failure may spend 1–2 extra credits (search and/or backfill). Stop and report if the Phase 2 total would pass 15.
- If step 5 returns `not_found` or `provider_error` for AAPL, the `symbol_search` field names differ from the docs. Stop, record the `fetch_log.message` summary, and send it back to the Planner. Don't guess-fix.
- The e2e user and its watchlist rows stay afterwards (see "Decisions taken").

---

## API credit estimate (Phase 2)
| Activity | Twelve Data credits |
|---|---|
| P2-T1 … P2-T8 (every test uses FakeProvider or a fake fetch; Supabase tests use a fake fetch or skip) | **0** |
| T9 step 1 (Supabase integration tests) | 0 |
| O0 (project setup, live key checks) | 0 (Supabase only) |
| T9 step 2 (logged-out checks) | 0 |
| T9 step 3 (sign-up refused) | 0 |
| T9 step 4: AAPL backfill on first chart open (**cache empty**) | 1 |
| T9 step 5: `symbol_search` for AAPL, MSFT, NVDA | 3 |
| T9 step 5: MSFT and NVDA backfills by the refresh queue (cold) | 2 |
| T9 step 6: ZZZZQX search | 1 |
| T9 step 6: duplicate, invalid | 0 |
| T9 steps 7–13 (cache reads, reorder, remove, chart from cache, logout) | 0, provided the run doesn't straddle 18:00 New York (see T9 "Timing") |
| Retries / re-runs, or incrementals if the cutoff is crossed after all | 0–2 |
| **Expected total** | **7 credits** (7–9 with retries). Hard cap **≤ 15** |

All counts assume **no cached data** (new, empty project): 4 searches (AAPL, MSFT, NVDA, ZZZZQX) + 3 backfills (AAPL, MSFT, NVDA).

**Peak per minute:** with T9's 20 s pacing, the spends land at about t = 0 s (AAPL backfill), 20 s (AAPL search), 40 s (MSFT search) + ~41 s (MSFT backfill), 61 s (NVDA search) + ~62 s (NVDA backfill), 82 s (ZZZZQX). Any 60 s window holds **at most 4**, against 8/min. Even with no pacing at all, the 7 credits stay under 8/min, and the budget guard refuses an 8th before it reaches Twelve Data.

**Day total:** the new `fetch_log` starts at 0, so the guard sees only Phase 2's ≤ 15. Twelve Data counts per API key, so add any earlier spend today on the same key that's not in the new `fetch_log` (recorded in T9 "Before starting"). Even allowing generously for that, the total is far below 800/day.

**Steady-state cost of the feature (for Tom):**
- **First load of a 10-ticker watchlist, all cold:**
  - adding the tickers = 10 `symbol_search` credits (one per add);
  - the sidebar then backfills 10 tickers at ≤ 6/min = 10 credits over about 100 s;
  - **one-off total ≈ 20 credits.**
  - The minute cap can't be breached by the queue alone. If adds and chart opens push past 8/min, the budget guard refuses the call before it reaches Twelve Data. The queue pauses with "Paused: Twelve Data's free-plan limit (8 calls a minute)… Click Retry", and rows keep their cached values or "Not loaded yet".
- **Every US trading day afterwards:** 1 incremental credit per ticker, once, after 18:00 New York (≈ noon NZ). That's 10/day for 10 tickers, plus any non-watchlist charts.
- **Viewing the sidebar:** 0 credits. `GET /api/watchlist` is cache-only, and `/quote` is never used.

---

## Open questions for Tom
None block the build or the proof. Tom steps 1–2 (your own account; Vercel env var) are listed under "Orchestrator steps".

Decisions taken in this plan. Flag any you disagree with; none need an answer to proceed:
1. **Email + password login, not magic link.**
   - Supabase's built-in mailer only sends to org team members at about 2 emails/hour, and a custom SMTP service would be a new service.
   - Password login needs no email. Sign-ups are switched off, and you create your account in the dashboard.
   - Magic link can be added later if you want it.
2. **The whole app is behind login, including the chart and `/api/candles`.** This stops strangers spending the shared Twelve Data budget.
3. **The sidebar's "last price" is the last completed daily close** (dated), and "day % change" is that close against the previous close. Both come from the Supabase cache. The `/quote` endpoint (1 credit per ticker per view) is not used.
4. **The sidebar automatically refreshes stale or cold tickers**, one at a time, every 10 s at most (≤ 6 credits/min). It stops with a message on any rate limit.
5. **Watchlist cap: 30 tickers.**
6. **`symbol_search` calls are logged in `fetch_log` with `interval = 'symbol_search'`.** The column is free text, so there's no schema change.
7. **Test user:** an E2E login `e2e@example.com` (password only in `.env.local`) is created for the Playwright proof and left in place with its 2 watchlist rows. It can't see your rows (RLS). Delete it in the dashboard whenever you like. We won't delete it without your OK, per the data-deletion rule.

---

## Review round 1 fixes

**Required 1: deleted project ref hard-coded; no step set up the new project.**
- **Ref derivation:** removed every hard-coded project ref. A new "Deriving the project ref" section gets `$ref` from `NEXT_PUBLIC_SUPABASE_URL` (`node -p 'new URL(…).hostname.split(".")[0]'` after sourcing `.env.local`, with a format check). O2's `auth.users` SQL, O3, O4, O5, the O3 verify step and all T9 SQL now use `/v1/projects/$ref/...`.
- **New step O0, before P2-T1:**
  1. allow the new host in the sandbox network (`get_environment` → `update_environment`), and drop the deleted host if listed;
  2. update `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`;
  3. derive the ref and confirm it's the new Sydney project (`GET /v1/projects/$ref`: `ap-southeast-2`, `ACTIVE_HEALTHY`);
  4. write `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `GET /v1/projects/$ref/api-keys?reveal=true`, via a Node one-off that never prints values (verified by prefix-only `grep -c`);
  5. apply `supabase/migrations/20261125000000_initial_schema.sql` unchanged (`git diff --exit-code supabase/`, sha256 recorded);
  6. verify `relrowsecurity = true` on all 4 tables, both owner policies, the key grants, and 0 rows everywhere;
  7. live-check the secret and publishable keys (0 Twelve Data credits);
  8. re-read the auth config, signing-key algorithm/status and API-key types from the new project.
- **O1** is folded into O0 (sub-step 4). T1 and T2 "after O1" now say "after O0". The acceptance table and T9 heading reference O0/O2/O3.
- **Historical facts marked:** the "Verified facts" entries for signing keys, publishable key and auth config now say they came from the deleted project, and that O0 re-reads them. "Live project state" is replaced by "Project state": the new project is empty, the deleted project's data is gone, and the schema facts are cited from the migration file. The email + password decision is explained as independent of the old values (O3 sets every field it relies on).
- **Tom steps:** create his account in the new project; Vercel needs the new URL and secret key as well as the publishable key.

**Required 2: T9 and the credit estimate assumed Phase 1's cached AAPL/MSFT data.**
- **Step 4:** opening `/chart/AAPL` now expects a backfill ("Source: Twelve Data (just fetched)", 1 credit, an `AAPL 1day ok` row).
- **Step 5:** AAPL then has a price straight away. MSFT and NVDA show "Not loaded yet" and are filled by the queue. The SQL expects exactly: AAPL search; MSFT search + `1day ok`; NVDA search + `1day ok`; no AAPL `1day` row after step-start.
- **Step 10:** the baseline now expects 7 rows, all tickers fresh, and the chart loading from cache.
- **Step 14:** records the Phase 2 spend, the earlier spend and their sum.
- **New "Before starting" block:**
  - the baseline comes from the new `fetch_log` (expected 0), plus a separately recorded "earlier spend today, not in `fetch_log`", because Twelve Data counts credits per API key and the guard can't see credits logged in the deleted project;
  - a timing rule (don't straddle 18:00 New York);
  - 20 s pacing between credit-spending actions.
- **Credit table redone for an empty cache:** 4 searches (AAPL, MSFT, NVDA, ZZZZQX) + 3 backfills (AAPL, MSFT, NVDA) = **7 expected**, 7–9 with retries. The ≤ 15 cap is kept. The per-minute peak is recomputed from the paced timeline: **≤ 4/min**, and still < 8 even unpaced.

**Optional points**
- **T1, HS256 fallback:** applied. Verified facts explain both cases. O0 sub-step 8 records the signing-key type, and a T1 risk note says what HS256-only means (no code change).
- **T1, `process.env` grep:** applied. A new T1 "Done when" check expects only `lib/config-error.ts` (tests excluded).
- **T8 size:** applied as an allowed split (P2-T8a: client and queue; P2-T8b: sidebar, layout, hook, CSS) if the first code review runs long. The plan's task order is unchanged.
- **Refresh queue, never-fresh ticker:** applied as a T8 risk line. A related note was added: pacing applies within one queue run only, so manual adds aren't paced; the budget guard covers it, and T9 paces its own adds.
- **Decision 7 (E2E user):** no change; it's already disclosed.

**Not changed:** schema (the migration is re-applied as-is), T1–T8 code steps, and the design decisions.
