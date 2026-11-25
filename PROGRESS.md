# PROGRESS

## Phase 1 – Chart for one ticker

### P1-T1 – Scaffold Next.js 16 app, Vitest and repo hygiene (built, awaiting code review)

**What changed**
- Scaffolded with `create-next-app@16.4.6` in a temp dir (flags per PLAN.md) and copied into the repo root: `app/`, `AGENTS.md`, `eslint.config.mjs`, `next.config.ts`, `tsconfig.json`, `package.json`, `README.md`. Removed `app/page.module.css`. No `cacheComponents` in `next.config.ts`.
- `package.json`: name `market-charter`, scripts `dev`, `build`, `start`, `lint` (`eslint`), `test` (`vitest run`), `test:watch`. Pinned exact: `vitest` 5.1.1, `lightweight-charts` 5.3.0, `@supabase/supabase-js` 2.119.2, `server-only` 0.0.1. `@types/node` ^22. `technicalindicators` and `@supabase/ssr` not installed.
- `vitest.config.mts` and `test/stubs/server-only.ts` as specified.
- `.gitignore` rewritten (union plus `!.env.example`). `.env.example` as specified.
- `test/env-example.test.ts` (3 tests: required keys, empty values, only `NEXT_PUBLIC_SUPABASE_URL` is public).
- `app/layout.tsx` (no Google fonts, `lang="en-NZ"`), `app/page.tsx` (link to `/chart/AAPL`), `app/globals.css`, `README.md` (with `## Database setup` placeholder for T2).
- `AGENTS.md` kept as generated. `BUILD_LOOP.md` not touched.

**Proof**
- `npm run build`: passes (routes `/` and `/_not-found`).
- `npm run lint`: passes, no output.
- `npm test`: 1 file, 3 tests passed.
- `grep -r "next/font" app` and `grep cacheComponents next.config.ts`: no matches.
- `git check-ignore -q .env.example` exits 1 (not ignored); `git check-ignore -q .env.local` exits 0 (ignored).
- `package.json` versions checked by eye against the plan.

**API credits used:** 0

**Issues:** none. Note: `/chart/AAPL` link on the home page 404s until P1-T8, as planned.
