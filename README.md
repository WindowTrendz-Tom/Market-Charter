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

See P1-T2.
