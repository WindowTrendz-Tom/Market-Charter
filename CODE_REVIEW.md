VERDICT: APPROVED

Review of P1-T8 (round 1).

Checks run by the reviewer
- `npm run build`: passes, lists `ƒ /chart/[symbol]`. `npm run lint`: clean. `npm test`: 12 files passed, 1 skipped; 98 passed, 10 skipped.
- Leak check with dummy values: LEAK_CHECK_OK.
- v5 grep: no `add*Series(` v4 calls; `addSeries(CandlestickSeries` appears once (components/candle-chart.tsx:28).
- Browser check (Playwright/Chromium, `.env.local` moved aside, `next start -p 3100`): `/chart/AAPL` renders the `role="alert"` box "Server configuration is incomplete."; footer shows the TradingView notice and a link to https://www.tradingview.com/; no page errors. Screenshot: docs/evidence/p1-t8-error-state.png. `.env.local` restored and confirmed (`.env.local.bak` gone).

Constraints
- API key: client code only calls `/api/candles/...`; no secrets in `.next/static`.
- Chart cleanup: `chart.remove()` on effect cleanup. `autoSize`, `attributionLogo` set.
- NZ time: `timeFormatter` and `tickMarkFormatter` use the Pacific/Auckland formatters from lib/time/display.
- Robustness: network failure, unparsable body, empty candles, 429/500 messages and busy-503 retry (capped, cancel-aware) all handled without a crash.
- No `any` types. Scope matches the plan.

Optional
1. app/globals.css: the `footer` rule is now declared twice (the new block at the end duplicates the earlier one with a slightly different font-size). Remove one.
2. `ChartView` has no render tests beyond the footer (the plan did not ask for any).
