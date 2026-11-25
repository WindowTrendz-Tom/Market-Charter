VERDICT: APPROVED

Review of P2-T7 (round 1). Checks run: `npx tsc --noEmit` clean, `npm run lint` clean, `npm test` 282 passed / 11 skipped, `npm run build` lists `ƒ /api/watchlist` and `ƒ /api/watchlist/refresh`. No Twelve Data calls; .env.local not read.

Checked and OK
- Every handler goes through `withWatchlistDeps`. `getAuthContext()` runs first, and `!user` returns 401 before `buildWatchlistDeps`, body parsing or any service call. Per-method 401 tests assert deps and the services are not called.
- The user id comes only from the session. Routes never read a user id from the body, query or headers, and the store inserts without `user_id` (column default `auth.uid()`).
- `deps.ts`: the watchlist store gets the user-scoped `supabase` client, and only the candle store gets `createSupabaseAdminClient()`. The provider comes from `getDataProvider()`. The key stays server-side (`server-only`).
- Body handling matches the plan. Bad JSON, arrays, null and numbers give 400 `invalid_body`. POST returns 201, DELETE returns 204 with a null body and `no-store`, and PATCH saves then re-lists. Failures map through `errorJson`, including `Retry-After`.
- Error bodies are generic. `ConfigError` logs only the variable names and returns 500 `config` with no names in the body. Other throws log `err.message` only and return a generic `provider_error`.
- The routes use `force-dynamic` and the standard `Request`/`Response` handlers, so they are compatible with Next.js 16 route conventions.
- Scope: `lib/watchlist/route-handler.ts` is acceptable. It is a thin shared wrapper that removes five copies of the auth, config and error flow. It adds no behaviour beyond the plan's common flow.

Optional
- `route-handler.ts` imports `ChartCandlesFailure` from `get-chart-candles`. That is fine, but the plan's file list should note the extra file.
- `readJsonObject` casts with `as Record<string, unknown>`. That is safe after the guard.
