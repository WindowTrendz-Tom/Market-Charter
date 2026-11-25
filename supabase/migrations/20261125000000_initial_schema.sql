-- Phase 1 schema. All four tables from the brief, created now to avoid post-Phase-1 schema changes.
create table public.candles (
  symbol     text        not null,
  "interval" text        not null,
  ts         timestamptz not null,
  open       numeric     not null,
  high       numeric     not null,
  low        numeric     not null,
  close      numeric     not null,
  volume     bigint,
  primary key (symbol, "interval", ts),
  constraint candles_symbol_upper check (symbol = upper(symbol)),
  constraint candles_interval_valid check ("interval" in ('1h', '1day', '1week', '1month'))
);

create table public.fetch_log (
  id               bigint      generated always as identity primary key,
  symbol           text        not null,
  "interval"       text        not null,
  credits_used     integer     not null default 0 check (credits_used >= 0),
  status           text        not null check (status in ('pending', 'ok', 'rate_limited', 'not_found', 'error', 'expired')),
  candles_received integer,
  message          text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create index fetch_log_series_created_idx on public.fetch_log (symbol, "interval", created_at desc);
create index fetch_log_created_idx on public.fetch_log (created_at desc);
-- Lease: at most one in-flight Twelve Data call per series.
create unique index fetch_log_one_pending_per_series on public.fetch_log (symbol, "interval") where status = 'pending';

create table public.watchlist (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  symbol     text        not null check (symbol = upper(symbol)),
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, symbol)
);

create table public.indicator_prefs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  symbol     text        check (symbol is null or symbol = upper(symbol)), -- null = default config
  config     jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint indicator_prefs_user_symbol_key unique nulls not distinct (user_id, symbol)
);

alter table public.candles         enable row level security;
alter table public.fetch_log       enable row level security;
alter table public.watchlist       enable row level security;
alter table public.indicator_prefs enable row level security;

-- Supabase no longer auto-exposes new tables to the Data API: grant explicitly.
revoke all on public.candles, public.fetch_log, public.watchlist, public.indicator_prefs from anon, authenticated;
grant select, insert, update, delete on public.candles, public.fetch_log to service_role;
grant select, insert, update, delete on public.watchlist, public.indicator_prefs to authenticated, service_role;

create policy "watchlist_owner_all" on public.watchlist for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "indicator_prefs_owner_all" on public.indicator_prefs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
