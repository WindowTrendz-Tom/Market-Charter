VERDICT: APPROVED

Task: P1-T9 (live acceptance proof), round 1.

Checks run offline: `npm run build` passes, `npm run lint` clean, `npm test` 98 passed / 10 skipped (the Supabase integration file is skipped without RUN_SUPABASE_TESTS; PROGRESS.md records the 108/108 live run).

Acceptance criteria:
- Chart shows daily candles: met. The desktop and phone screenshots show AAPL candles, last candle 24 Nov 2026.
- Cache-first, fetch and store when empty: met. fetch_log went 0 to 1 row (ok, 5000 candles) and candles went 0 to 5000.
- Second load makes zero API calls: met. Three further loads (phone, desktop, curl) left AAPL fetch_log at 1 row. The phone screenshot shows "Source: Supabase cache".
- Attribution in the footer: met. The TradingView notice and link appear in all three screenshots.
- Extras: bad ticker gives a clear message and a not_found log row; 3 parallel MSFT requests gave 1 fetch; the browser made no external requests.
- RLS: the orchestrator's pg_class check shows candles, fetch_log, indicator_prefs and watchlist all true.
- Credits used: 4 for the day, within budget.

Not blocking (as agreed): Vercel preview (needs Tom) and the next-trading-day refresh check.

Optional:
- Edit the PROGRESS.md "Step 1: NOT run" line to point at the orchestrator RLS section below it, so the record doesn't contradict itself.
- Tick the Phase 1 boxes in PLAN.md when the orchestrator closes the phase, noting the Vercel and refresh items as outstanding.
