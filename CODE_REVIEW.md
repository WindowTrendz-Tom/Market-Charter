VERDICT: APPROVED

# Code review – P2-T2 (Login, logout, protected app shell, auth on the candles route), round 2

## Round 1 blocking point
1. **`lib/auth/sign-in-error.ts:3`: a network failure was reported as a wrong password.** Fixed.
   - The function now checks `!status || status >= 500`, so `undefined` and `0` (auth-js `AuthRetryableFetchError` on a network failure) both return "Couldn't reach the login service. Try again shortly."
   - `lib/auth/sign-in-error.test.ts:11` asserts `signInErrorMessage(0)`.
   - 429 and 4xx still map as before.
   - The fix is noted in PROGRESS.md.

## What changed since round 1
Only `lib/auth/sign-in-error.ts`, its test and `PROGRESS.md` changed. Every other P2-T2 file is unchanged since round 1, which I confirmed by file modification times against the round 1 review. `next-env.d.ts` and `tsconfig.tsbuildinfo` were rewritten by the build, but neither shows in `git status`.

## Checks run by the reviewer
- `npm run lint`: clean.
- `npm test`: 20 files passed, 1 skipped; 146 passed, 10 skipped. The new assertion sits inside an existing case, so the count is unchanged.
- `npm run build`: passes. Routes `/`, `/chart/[symbol]`, `/login`, `/api/candles/[symbol]` and `ƒ Proxy (Middleware)` are present.
- `npx tsc --noEmit`: clean.
- `grep -rn "signUp\|signup\|sign-up" app lib components`: no output.

## Results carried over from round 1 (code unchanged since then)
- **Dev server, logged out:**
  - `/api/candles/AAPL` → 401 `unauthorized`
  - `/` → 307 to `/login`
  - `/chart/AAPL` → 307 to `/login?next=%2Fchart%2FAAPL`
  - `/login` → 200 with the heading and the current-password input
  - `?next=//evil.com` → `next` is `/`
- **Twelve Data:** zero calls.
- **Server Actions** follow the Next.js 16 docs:
  - `useActionState` with the `(prevState, formData)` signature;
  - `redirect()` is called outside try/catch.
- **Error messages** don't reveal whether an email exists.
- **`safeNextPath`** is applied to the post-login redirect.
- **Candles route:** auth runs first, before any DB or provider work.
- **ChartView:** the 401 retry is bounded to one.
- **Client bundle:** no secret keys.
- **Phase 1 behaviour** is intact.
- **Scope:** matches the plan.

## Optional (not blocking, carried over)
- **`app/login/actions.ts:29`:** `signInWithPassword` can throw for non-Auth errors. That would show the route error page rather than a form message. It's rare.
- **`app/(app)/actions.ts:6`:** `signOut` doesn't catch `ConfigError`. The proxy returns 500 first in practice.
- **`app/api/candles/[symbol]/route.test.ts`:** the 401 case could also assert that `createSupabaseAdminClient` was not called.
- **`app/globals.css`:** `footer` stays at `max-width: 1100px` while `main` is 1400px. That's as the plan specifies.
