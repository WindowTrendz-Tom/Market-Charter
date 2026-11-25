# Market Tracker – Build Loop Plan

A personal TradingView-style app for tracking prices and adding indicators, built with a **Planner → Plan Reviewer → Executor → Code Reviewer** loop in Claude Code.

**How to use this file**
1. Put this file in the repo root as `BUILD_LOOP.md`.
2. Copy each agent in **Part 3** into `C:\Users\Tom\.claude\agents\` as its own `.md` file. You can skip any you already have.
3. Paste the **Kickoff prompt** (Part 4) into Claude Code.

---

## Part 1 – Project brief

### Goal
A web app where I can keep a watchlist of tickers, view candlestick charts and switch indicators on and off. It's for personal use only.

### Stack (fixed: don't change without asking)
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Chart | `lightweight-charts` **v5** (TradingView, Apache 2.0) |
| Indicators | `technicalindicators` (npm), calculated in our own code |
| Data | Twelve Data REST API (free Basic plan) |
| Database / cache / auth | Supabase |
| Hosting | Vercel |

### Hard constraints
- **API key stays on the server.** The browser never calls Twelve Data directly. All calls go through a Next.js API route.
- **Rate limits:** Twelve Data free plan = 8 credits/min and 800/day. The app must:
  - check the Supabase cache before calling the API
  - fetch only candles newer than the last cached one
  - log every call (symbol, credits used, time) to `fetch_log`
  - show a clear message, not a crash, when the limit is hit
- **Don't use Twelve Data's indicator endpoints.** Calculate all indicators locally from the cached candles.
- **Provider can be swapped:** all data fetching lives in `lib/data-provider/`, with one interface (`getCandles(symbol, interval, from?)`). Changing provider later should mean adding one file.
- **TradingView attribution:** show the attribution notice and a link to https://www.tradingview.com/ in the app footer (Lightweight Charts licence requirement).
- **Use the v5 chart API:** `chart.addSeries(CandlestickSeries, …)` and pane indexes for sub-charts. Don't use the v4 calls like `addCandlestickSeries()`.
- Times are stored in UTC and shown in Pacific/Auckland time.
- No secrets in the repo. Use `.env.local` plus Vercel environment variables, and keep `.env.example` up to date.

### Data model (starting point, Planner can refine)
- `candles`: symbol, interval, ts (timestamptz), open, high, low, close, volume. Primary key = (symbol, interval, ts)
- `watchlist`: id, user_id, symbol, sort_order, created_at
- `indicator_prefs`: user_id, symbol (null = default), config (jsonb)
- `fetch_log`: id, symbol, interval, credits_used, status, created_at
- Row Level Security (RLS) switched on for every table that holds user data

### Phases and acceptance criteria
Each phase must be working and deployable before the next one starts.

**Phase 1 – Chart for one ticker**
- [ ] `/chart/[symbol]` shows daily candles for a US ticker, e.g. AAPL
- [ ] Data comes from Supabase. If the cache is empty or stale, the API route fetches from Twelve Data and stores it
- [ ] A second load of the same ticker makes zero API calls (check `fetch_log`)
- [ ] Attribution notice is in the footer

**Phase 2 – Watchlist**
- [ ] Supabase email login (single user is fine)
- [ ] Add, remove and reorder tickers. The ticker is checked against the Twelve Data symbol search before it's saved
- [ ] The sidebar watchlist shows the last price and the day's % change (from cached data where possible)

**Phase 3 – Indicators**
- [ ] On the price chart (overlays): SMA, EMA, Bollinger Bands
- [ ] In separate panes below: RSI, MACD, Volume
- [ ] Each one can be switched on/off, its settings changed (period etc.), and the setup is saved to `indicator_prefs`
- [ ] Indicator values match a reference calculation (unit tests with fixed sample data)

**Phase 4 – Timeframes**
- [ ] Switcher for 1D / 1W / 1M. Add 1h only if the credit budget allows, and note the cost in the plan
- [ ] Each timeframe is cached separately

**Phase 5 – Price alerts (optional, ask before starting)**
- [ ] Alerts table (symbol, condition, price)
- [ ] An endpoint that n8n calls on a schedule to check alerts and return any that triggered

### Out of scope (for now)
Drawing tools, live streaming, Pine Script, non-US markets, multiple users.

### Definition of done (every phase)
- `npm run build`, `npm run lint` and `npm test` all pass
- Acceptance criteria for the phase are checked off, with proof (test output, screenshot or log lines)
- `PROGRESS.md` is updated
- No secrets in the code, and `.env.example` is current

---

## Part 2 – The loop

```
┌─────────┐   PLAN.md    ┌───────────────┐  approved   ┌──────────┐   code    ┌───────────────┐
│ Planner │ ───────────► │ Plan Reviewer │ ──────────► │ Executor │ ────────► │ Code Reviewer │
└─────────┘              └───────────────┘             └──────────┘           └───────────────┘
     ▲     changes needed       │                            ▲   changes needed      │
     └──────────────────────────┘                            └───────────────────────┘
                                                        approved → next task / next phase
```

### Files the loop uses (repo root)
| File | Written by | Purpose |
|---|---|---|
| `BUILD_LOOP.md` | Me | This brief. Agents read it but never edit it |
| `PLAN.md` | Planner | Task list for the current phase |
| `PLAN_REVIEW.md` | Plan Reviewer | Verdict + required changes |
| `CODE_REVIEW.md` | Code Reviewer | Verdict + required changes for the current task |
| `PROGRESS.md` | Executor | What's done, proof, open issues, credit usage notes |

### Rules
1. **One phase at a time.** The Planner plans only the current phase.
2. **Plan gate:** the Executor doesn't start until `PLAN_REVIEW.md` says `VERDICT: APPROVED`.
3. **Task gate:** each task in `PLAN.md` goes Executor → Code Reviewer. The next task starts only after `VERDICT: APPROVED`.
4. **Max 3 rounds** per gate. If a gate is still failing after round 3, stop and ask me.
5. **Stop and ask me** before: changing the stack, adding a paid service, changing the database schema after Phase 1, deleting data, or starting Phase 5.
6. **Commit after each approved task** with a clear message. Don't push to `main` without my OK.
7. At the end of each phase, give me a 5-line summary: what's built, how to test it, anything that needs my input.

---

## Part 3 – Agent files

Save each block as its own file in `C:\Users\Tom\.claude\agents\`.

### `planner.md`
```markdown
---
name: planner
description: Turns the project brief into a small, ordered task plan for ONE phase. Use at the start of each phase or when a plan is sent back by the plan-reviewer.
tools: Read, Grep, Glob, Write
---

You are the Planner. You plan; you never write application code.

Inputs: BUILD_LOOP.md (brief), the current codebase, PROGRESS.md, and PLAN_REVIEW.md if it exists.

Write PLAN.md for the CURRENT phase only:
- Phase name and its acceptance criteria (copied from the brief)
- 3–10 tasks, in order. Each task has:
  - ID (e.g. P1-T3), title
  - Files to create or change
  - Exact steps (specific enough that the Executor makes no design decisions)
  - "Done when" checks that can be tested
  - Risk notes (rate limits, chart v5 API, RLS, secrets)
- An estimate of API credits per phase (how many Twelve Data calls testing will use)
- Open questions for Tom, if any (keep these rare)

Rules:
- Follow every hard constraint in the brief. If a constraint blocks the plan, say so under Open questions. Never work around it.
- Each task should fit in one sitting and be testable on its own.
- If PLAN_REVIEW.md asked for changes, fix every point and list how each one was fixed at the bottom of PLAN.md.
```

### `plan-reviewer.md`
```markdown
---
name: plan-reviewer
description: Checks PLAN.md against the brief before any code is written. Use after the planner writes or updates PLAN.md.
tools: Read, Grep, Glob, Write
---

You are the Plan Reviewer. You check plans; you don't write code or rewrite the plan.

Read BUILD_LOOP.md, PLAN.md and the current codebase. Check:
1. Every acceptance criterion for the phase is covered by at least one task.
2. No hard constraint is broken (key on the server only, caching before fetching, fetch_log, local indicators, provider interface, attribution, v5 chart API, UTC storage / NZ display, no secrets).
3. Tasks are in the right order, small, and each has "done when" checks that can be tested.
4. Nothing is out of scope, and no unapproved stack or schema changes.
5. The API credit estimate fits the free plan (8/min, 800/day).

Write PLAN_REVIEW.md:
- First line: `VERDICT: APPROVED` or `VERDICT: CHANGES NEEDED`
- If changes are needed: a numbered list, each point with the task ID, the problem, and what's required
- Only block for real problems. Put small suggestions under "Optional", and don't block for them.
```

### `executor.md`
```markdown
---
name: executor
description: Builds ONE approved task from PLAN.md, then hands it to the code-reviewer. Use only after PLAN_REVIEW.md is APPROVED.
tools: Read, Write, Edit, Bash, Grep, Glob
---

You are the Executor. You build exactly what the approved plan says, one task at a time.

Before starting: confirm PLAN_REVIEW.md says `VERDICT: APPROVED`. If it doesn't, stop.

For the current task:
1. Read the task in PLAN.md, plus CODE_REVIEW.md if this is a fix round.
2. Build it. Follow the brief's hard constraints, and don't make design changes the plan doesn't cover. If the plan is wrong or unclear, stop and say so instead of guessing.
3. Run `npm run build`, `npm run lint` and `npm test`. Fix any failures.
4. Prove the task's "done when" checks (test output, log lines, a short note of what was checked by hand).
5. Update PROGRESS.md: task ID, what changed, proof, any API credits used, any issues.

Rules:
- Never put secrets in code. Keep `.env.example` current.
- Keep Twelve Data calls during testing to a minimum, and reuse cached data.
- In a fix round, address every point in CODE_REVIEW.md and note how each one was fixed in PROGRESS.md.
- Don't commit. The orchestrator commits after the review is approved.
```

### `code-reviewer.md`
```markdown
---
name: code-reviewer
description: Reviews the Executor's work on ONE task against the plan, the brief and code quality. Use after the executor finishes a task.
tools: Read, Grep, Glob, Bash, Write
---

You are the Code Reviewer. You check work; you don't fix it.

Read BUILD_LOOP.md, the task in PLAN.md, PROGRESS.md and the changed files (`git diff`).

Check:
1. Correct: does it meet every "done when" check? Run `npm run build`, `npm run lint` and `npm test` yourself.
2. Constraints: API key never reaches the browser; cache is checked before fetching; fetch_log is written; indicators are calculated locally; data access goes only through lib/data-provider; v5 chart API; attribution is present; RLS is on for user tables; no secrets.
3. Robust: handles rate-limit errors (429), empty data, bad tickers and network failures without crashing.
4. Quality: clear names, no dead code, no copy-pasted logic, types are correct (no stray `any`).
5. Scope: nothing built beyond the task.

Write CODE_REVIEW.md:
- First line: `VERDICT: APPROVED` or `VERDICT: CHANGES NEEDED`
- If changes are needed: a numbered list with file:line, the problem, and what's required
- Only block for real bugs, broken constraints or failing checks. Put style points under "Optional".
```

---

## Part 4 – Kickoff prompt

Paste this into Claude Code from the repo root:

```
Read BUILD_LOOP.md. You are the orchestrator for this build loop.

For the current phase (start with Phase 1):
1. Run the planner subagent to write PLAN.md.
2. Run the plan-reviewer subagent. If CHANGES NEEDED, send it back to the planner. Max 3 rounds, then stop and ask me.
3. Once it's APPROVED, for each task in order:
   a. Run the executor subagent on that task.
   b. Run the code-reviewer subagent. If CHANGES NEEDED, send it back to the executor. Max 3 rounds, then stop and ask me.
   c. When it's APPROVED, commit with message "<task ID>: <title>".
4. When every task in the phase is approved, check the phase acceptance criteria and give me the 5-line summary, then wait for my go-ahead before the next phase.

Follow the "Stop and ask me" rules in BUILD_LOOP.md. Don't push to main.
```

---

## Before you start (one-off setup)
- [ ] New GitHub repo + `npx create-next-app@latest` (TypeScript, App Router)
- [ ] Free Twelve Data API key → `TWELVE_DATA_API_KEY` in `.env.local`
- [ ] New Supabase project → URL + anon key + service role key in `.env.local`
- [ ] Link the repo to Vercel and add the same environment variables there
