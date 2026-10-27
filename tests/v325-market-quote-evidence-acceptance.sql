\set ON_ERROR_STOP on
-- V325 launches in a clean, temporary PostgreSQL 17 container only.
DO $$
DECLARE result jsonb;
BEGIN
 result:=public.market_quote_evidence_v325();
 IF result->>'capital_permission'<>'0R'
    OR result->>'machine_execution_allowed'<>'false'
    OR result->>'licensing_verified'<>'false'
    OR result->>'quote_integrity_gate'<>'HOLD'
    OR (result->>'mt5_tick_count')::int<>0
 THEN RAISE EXCEPTION 'empty quote sources must fail closed: %',result; END IF;
END $$;

INSERT INTO public.live_markets_snapshots(captured_at) VALUES(now());
INSERT INTO public.gold_live_snapshots(captured_at,source_times)
VALUES(now(),jsonb_build_object(
  'gold',to_char(now()-interval '1 minute','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'dxy',to_char(now()-interval '45 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'brent',to_char(now()-interval '2 minutes','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'bitcoin',to_char(now()-interval '1 minute','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'eurusd',to_char(now()-interval '1 minute','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'us10y',to_char(now()-interval '10 hours','YYYY-MM-DD"T"HH24:MI:SS"Z"')
));
INSERT INTO public.gold_spot_snapshots(captured_at)
VALUES(now()-interval '40 days');

DO $$
DECLARE result jsonb;
BEGIN
 result:=public.market_quote_evidence_v325();
 IF result->>'quote_integrity_gate'<>'HOLD'
   OR result->'quote_time_by_asset'->'dxy'->>'status'<>'STALE'
   OR result->'quote_time_by_asset'->'gold'->>'status'<>'FRESH_INDICATIVE'
   OR (result->>'mt5_tick_count')::int<>0
   OR result->>'latest_markets_snapshot_at' IS NULL
   OR result->>'gold_spot_archive_at' IS NULL
   OR result->>'machine_execution_allowed'<>'false'
 THEN RAISE EXCEPTION 'recent snapshot masked 45m old DXY or 40d Gold spot: %',result; END IF;
END $$;

-- Refresh only the synthetic DXY quote in ephemeral fixture, not production.
UPDATE public.gold_live_snapshots
 SET source_times=jsonb_set(source_times,'{dxy}',
  to_jsonb(to_char(now()-interval '1 minute',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
 WHERE id=1;
DO $$
DECLARE result jsonb;
BEGIN
 result:=public.market_quote_evidence_v325();
 IF result->>'quote_integrity_gate'<>'INDICATIVE_ONLY'
    OR result->>'capital_permission'<>'0R'
    OR result->>'licensing_verified'<>'false'
    OR result->>'machine_execution_allowed'<>'false'
 THEN RAISE EXCEPTION 'all recent quotes must remain NOT execution-ready: %',result; END IF;
END $$;

INSERT INTO public.gold_live_xauusd_ticks(observed_at) VALUES(now());
DO $$
DECLARE result jsonb;
BEGIN
 result:=public.market_quote_evidence_v325();
 IF (result->>'mt5_tick_count')::int<>1
    OR result->>'machine_execution_allowed'<>'false'
    OR result->>'licensing_verified'<>'false'
 THEN RAISE EXCEPTION 'one synthetic MT5 tick cannot authorize trading: %',result; END IF;
END $$;

UPDATE public.gold_live_snapshots
 SET source_times=jsonb_set(source_times,'{gold}','"malformed-time"')
 WHERE id=1;
DO $$
DECLARE result jsonb;
BEGIN
 result:=public.market_quote_evidence_v325();
 IF result->>'quote_integrity_gate'<>'HOLD'
    OR result->'quote_time_by_asset'->'gold'->>'status'<>'UNVERIFIED'
 THEN RAISE EXCEPTION 'invalid source timestamp passed: %',result; END IF;
 IF has_function_privilege(
  'anon'::regrole,
  'public.market_quote_evidence_v325()'::regprocedure,'EXECUTE')
    OR has_function_privilege(
  'authenticated'::regrole,
  'public.market_quote_evidence_v325()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'private quote evidence leaked to browser roles'; END IF;
 IF NOT has_function_privilege(
  'service_role'::regrole,
  'public.market_quote_evidence_v325()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'service-role-only quote integrity function inaccessible'; END IF;
END $$;
SELECT 'V325_MARKET_QUOTE_PROVENANCE_PG17_PASSED' AS result;
