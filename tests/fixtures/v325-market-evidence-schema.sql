-- V325 disposable PostgreSQL 17 only, never real production.
CREATE TABLE public.live_markets_snapshots(
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL
);
CREATE TABLE public.gold_live_snapshots(
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL,
  source_times jsonb
);
CREATE TABLE public.gold_spot_snapshots(
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL
);
CREATE TABLE public.gold_live_xauusd_ticks(
  id bigserial PRIMARY KEY,
  observed_at timestamptz NOT NULL
);
