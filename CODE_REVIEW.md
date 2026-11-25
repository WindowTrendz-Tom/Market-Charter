VERDICT: APPROVED

P2-T3 (round 1)

Checks run: build, lint and test pass (165 passed, 10 skipped). `tsc --noEmit` is clean. `grep -rn symbol_search app components` returns nothing.

- Prior tests: no existing lines in `twelve-data.test.ts` were removed or changed. The new tests are additions only.
- Live shape: the parser reads `symbol`, `instrument_name`, `exchange`, `mic_code`, `country`, `instrument_type` and `currency`. These match the real field names in the evidence file. The fixture's first item matches the real AAPL values (NASDAQ, XNGS, "United States", Common Stock, USD). The fixture is labelled synthetic in `_comment`.
- US rule: `country === "United States"` or a mic code in the US set. XNGS is in the set. Exact symbol match only, and Common Stock is preferred over ETF.
- Key: sent only in the `Authorization` header and covered by a test. Error messages carry no key or URL.
- Errors: 429 in the body, 500, 401, a missing `data` field and an empty `data` array are each tested.
- Dropped httpStatus: `getCandles` no longer passes `res.status` on the `status !== "ok"` bad_response path. That status was always 200 there. Nothing outside the provider reads `httpStatus`. Not blocking.

Optional
- `requestJson` returns `null` for "no data is available". For `/symbol_search` this is harmless, because `null` maps to `[]`.
