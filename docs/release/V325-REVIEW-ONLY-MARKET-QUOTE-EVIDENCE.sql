-- V325 REVIEW ONLY. Private, read-only provenance diagnostics.
-- DO NOT deploy to production without isolated backup/restore acceptance.
-- No quote prices or customer/provider authentication secrets are returned.
BEGIN;
CREATE OR REPLACE FUNCTION public.market_quote_evidence_v325()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_latest_market timestamptz;
  v_latest_gold timestamptz;
  v_gold_quote jsonb;
  v_latest_spot timestamptz;
  v_latest_tick timestamptz;
  v_tick_count bigint;
  v_assets jsonb := '{}'::jsonb;
  v_asset text;
  v_source_text text;
  v_quote_at timestamptz;
  v_quote_age numeric;
  v_critical_unfresh boolean :=false;
BEGIN
  SELECT max(captured_at) INTO v_latest_market
  FROM public.live_markets_snapshots;
  SELECT captured_at,source_times INTO v_latest_gold,v_gold_quote
  FROM public.gold_live_snapshots
  ORDER BY captured_at DESC LIMIT 1;
  SELECT max(captured_at) INTO v_latest_spot
  FROM public.gold_spot_snapshots;
  SELECT max(observed_at),count(*) INTO v_latest_tick,v_tick_count
  FROM public.gold_live_xauusd_ticks;

  FOREACH v_asset IN ARRAY ARRAY[
    'gold','dxy','brent','bitcoin','eurusd','us10y'
  ] LOOP
    v_source_text :=v_gold_quote->>v_asset;
    v_quote_at:=NULL;
    IF v_source_text IS NOT NULL
      AND v_source_text ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'
    THEN
      BEGIN
        v_quote_at:=v_source_text::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_quote_at:=NULL;
      END;
    END IF;
    v_quote_age:=CASE WHEN v_quote_at IS NULL THEN NULL
      ELSE round((extract(epoch FROM now()-v_quote_at)/60)::numeric,2)
    END;
    v_assets:=v_assets||jsonb_build_object(
      v_asset,jsonb_build_object(
        'source_time',v_quote_at,
        'quote_age_minutes',v_quote_age,
        'status',CASE
          WHEN v_quote_at IS NULL OR v_quote_at>now()+interval '2 minutes'
            THEN 'UNVERIFIED'
          WHEN v_quote_age>30 THEN 'STALE'
          WHEN v_quote_age>10 THEN 'DELAYED'
          ELSE 'FRESH_INDICATIVE'
        END,
        'redistribution_license_verified',false,
        'executable_quote_verified',false
      )
    );
    IF v_asset IN ('gold','dxy','brent')
       AND v_assets->v_asset->>'status'<>'FRESH_INDICATIVE'
    THEN v_critical_unfresh:=true;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',true,'version','market_quote_evidence_v325',
    'mode','READ_ONLY_RESEARCH_DATA',
    'quote_integrity_gate',CASE
      WHEN v_critical_unfresh THEN 'HOLD' ELSE 'INDICATIVE_ONLY' END,
    'generated_at',now(),
    'latest_markets_snapshot_at',v_latest_market,
    'latest_gold_snapshot_at',v_latest_gold,
    'gold_spot_archive_at',v_latest_spot,
    'mt5_tick_count',v_tick_count,
    'latest_mt5_tick_at',v_latest_tick,
    'quote_time_by_asset',v_assets,
    'licensing_verified',false,
    'broker_execution_verified',false,
    'commercial_activation_permitted',false,
    'machine_execution_allowed',false,
    'decision','WAIT',
    'capital_permission','0R',
    'caution','Snapshot freshness is not individual quote freshness. Gold futures are not XAUUSD spot. No paid redistribution or execution right is asserted.'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'ok',false,'version','market_quote_evidence_v325',
    'quote_integrity_gate','EVIDENCE_UNAVAILABLE',
    'licensing_verified',false,
    'machine_execution_allowed',false,
    'decision','WAIT','capital_permission','0R',
    'commercial_activation_permitted',false
  );
END
$fn$;
REVOKE ALL ON FUNCTION public.market_quote_evidence_v325()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_quote_evidence_v325()
TO service_role;
COMMIT;
