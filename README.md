# Market Charter

Personal TradingView-style app: daily candlestick charts for US tickers, with Twelve Data prices cached in Supabase. Built with Next.js (App Router), TypeScript and lightweight-charts v5.

## Scripts

- `npm run dev` start the dev server
- `npm run build` production build
- `npm run lint` ESLint
- `npm test` Vitest (run once); `npm run test:watch` for watch mode

## Environment

Copy `.env.example` to `.env.local` and fill in the values. Never commit real keys. The Twelve Data key and Supabase secret key are server-only.

## Database setup

1. Create a Supabase project.
2. Paste `supabase/migrations/20261125000000_initial_schema.sql` into the SQL Editor and run it, or run `supabase db push` if the CLI is linked.
3. Copy the Project URL and a **secret** key (Project Settings > API) into `.env.local`.

## Auth

Login is Supabase email + password. Public sign-ups are disabled, so create the user yourself: Supabase Dashboard > Authentication > Users > Add user (tick Auto Confirm User, password of 12 or more characters).

Required env vars (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_...), `SUPABASE_SECRET_KEY` and `TWELVE_DATA_API_KEY`.
