VERDICT: APPROVED

P1-T5 (round 1). No blocking issues found.

Checks run
- `npm run build` and `npm run lint`: clean.
- `npm test`: 8 files passed, 1 skipped (integration, 10 tests), 60 tests passed.
- Integration run against the real Supabase project: 9 files, 70 tests, all passed.

Specific points
- Paging: `readAll` uses 1000-row pages with a stable order (`ts` for candles, `id` for fetch_log), stops on a short page, and throws `StoreError` at the 50-page cap rather than truncating silently. Test (a) covers 1000 + 5 rows.
- Upsert: `onConflict: "symbol,interval,ts"`, chunks of 1000, no-op for an empty array. Test (b) covers 2500 rows as 3 POSTs.
- UTC: `ts` is normalised with `new Date(ts).toISOString()`, numerics via `Number()`, null volume kept. `created_at` and `completed_at` come from the injected clock.
- Lease: expires stale pending rows, inserts with the injected `created_at`, returns null on 23505. The partial unique index `fetch_log_one_pending_per_series` exists in the migration. `sumCreditsSince` filters `credits_used > 0` and sums in JS. Boundaries (`gte`) are tested.
- Integration cleanup deletes only `symbol like 'ZZTEST%'` from `candles` and `fetch_log`. All contract symbols use the prefix.
- Secret key: read only in `lib/env.ts` and the opt-in integration test. The store module is `server-only`. Test (e) confirms the key is never in a URL or body. Errors carry only the Supabase message.
- No stray `any`, no dead code, scope matches the plan.

Optional
- Expired leases keep `credits_used = 1`, so `sumCreditsSince` counts them. This is conservative for budget protection. Worth a one-line comment, or confirm it is intended when P1-T6 is reviewed.
