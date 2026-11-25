VERDICT: APPROVED

# Code review: P2-T1, Auth foundation (round 2)

## Round 1 blocking point: fixed
1. **Open redirect through tab/CR/LF in `safeNextPath`.** Fixed. `lib/auth/next-path.ts:10` now returns `/` for any control character (U+0000–U+001F, U+007F), with a comment explaining why. `lib/auth/next-path.test.ts` adds cases for tab, LF, CR and DEL. I ran the function directly:
   - `"/\t/evil.com"`, `"/\n/evil.com"` and `"/\r/evil.com"` all return `/`;
   - `"/chart/AAPL?x=1"` is still kept.

   ESLint raises no `no-control-regex` error on the new regex.

## Round 1 optional items: done
- `lib/supabase/server.ts:15`: a comment explains why the `headers` argument of `setAll` is ignored.
- `lib/supabase/proxy.test.ts`: `vi.restoreAllMocks()` now runs in `afterEach`, so the `console.error` spy is restored even if a test fails.

## Checks run by the reviewer (round 2)
- `npm run build`: pass. Output includes `ƒ Proxy (Middleware)`.
- `npm run lint`: pass.
- `npm test`: 17 files passed and 1 skipped; 131 tests passed and 10 skipped. That is 4 more tests than round 1, all from the new cases.
- `npx tsc --noEmit`: clean.
- `grep server-only` on the five proxy-side modules: no output.
- `grep -rln process.env …` (excluding tests): only `lib/config-error.ts`.
- Phase 1 tests: the only changed test file is `test/env-example.test.ts`, which the plan requires to change. All other Phase 1 tests are unchanged and pass.
- Nothing else changed since round 1:
  - `proxy.ts`, `lib/supabase/proxy.ts`, `lib/auth/session.ts`, `lib/auth/route-access.ts`, `lib/supabase/public-config.ts` and `lib/config-error.ts` are as approved in substance in round 1;
  - the Supabase cookie pattern, `getClaims()` straight after client creation, cookie and cache-header propagation on redirects, the publishable-key-only proxy graph and the asset-excluding matcher are all still in place.
- Round 1 dev-server proof still stands, since the proxy code is unchanged:
  - `/chart/AAPL` returns `307 …/login?next=%2Fchart%2FAAPL`;
  - `/_next/static/x.js` returns 404.

## Optional (not blocking)
- `lib/auth/next-path.ts:11`: `startsWith("/login")` also rejects paths such as `/loginhelp`. This is harmless, and the plan specified it.
