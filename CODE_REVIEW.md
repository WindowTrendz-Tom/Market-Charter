VERDICT: APPROVED

P2-T5, round 1. build, lint and npm test pass. The opt-in Supabase run passes (26 files, 220 tests), including the new contract case. No Twelve Data calls were made.

Checked:
- toQuote matches the plan. Previous close is the second-latest cached bar, and Phase 1 never caches the in-progress bar. It returns null for no candles, and prevClose and changePct are null for a single candle or a previous close of 0. asOf is UTC seconds.
- getRecentCandles orders ts descending, limits, then reverses, so the result is ascending. Errors give StoreError. The toCandle refactor is identical to the old mapping, so getCandles is unchanged.
- quote.ts and format.ts import nothing from server-only modules. There is no stray `any`.
- No dates are displayed in this task, so there is no Pacific/Auckland conversion to check.

Optional:
- changeClass returns "down" for a tiny negative value (for example -0.001) that formatChangePct renders as "0.00%". It could be rounded first so the colour matches the text.
