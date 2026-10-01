-- V171: evaluate simulation receipts, never production broker readiness.
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $guard$
begin
  if md5(pg_get_functiondef('public.run_v134_gold_broker_adapter_selftest()'::regprocedure))
      <> '6cbcaec354cbc12de73e5e360327d2b6' then
    raise exception 'V134 definition changed; inspect drift before applying V171';
  end if;
end;
$guard$;

create or replace function private.evaluate_v171_broker_lab_receipts(p_events jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_errors text[] := '{}'::text[];
  v_expected jsonb := '[
    ["DRY_RUN_LIFECYCLE","ORDER_PREPARED","PREPARED","LONG"],
    ["DRY_RUN_LIFECYCLE","DRY_RUN_ACK","ACKNOWLEDGED","LONG"],
    ["DRY_RUN_LIFECYCLE","DRY_RUN_FILL","FILLED_SIMULATED","LONG"],
    ["IDEMPOTENCY","DUPLICATE_BLOCKED","BLOCKED_DUPLICATE_KEY","LONG"],
    ["KILL_SWITCH","ORDER_PREPARED","PREPARED","SHORT"],
    ["KILL_SWITCH","KILL_SWITCH_BLOCKED","BLOCKED_KILL_SWITCH","SHORT"],
    ["LIVE_ROUTE_DENIAL","LIVE_SUBMIT_BLOCKED","BLOCKED_NO_LIVE_ROUTE","LONG"],
    ["AUTHZ_DENIAL","UNAUTHORIZED_SUBMIT_BLOCKED","BLOCKED_UNAUTHORIZED","NONE"]
  ]'::jsonb;
  v_event jsonb;
  v_i integer;
  v_time timestamptz;
  v_previous_time timestamptz;
  v_pass boolean;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then
    v_errors := array_append(v_errors,'INVALID_ENVELOPE');
  elsif jsonb_array_length(p_events) <> 8 then
    v_errors := array_append(v_errors,'EVENT_COUNT_MISMATCH');
  else
    for v_i in 0..7 loop
      v_event := p_events->v_i;
      if jsonb_typeof(v_event) is distinct from 'object'
         or v_event->'event_seq' is distinct from to_jsonb(v_i+1)
         or jsonb_typeof(v_event->'run_id') is distinct from 'number'
         or (v_event->>'run_id') !~ '^[1-9][0-9]*$'
         or v_event->'run_id' is distinct from p_events->0->'run_id'
         or v_event->'real_order_sent' is distinct from 'false'::jsonb
         or jsonb_typeof(v_event->'client_order_id') is distinct from 'string'
         or coalesce(length(btrim(v_event->>'client_order_id')),0)=0
         or jsonb_typeof(v_event->'idempotency_key') is distinct from 'string'
         or coalesce(length(btrim(v_event->>'idempotency_key')),0)=0
         or v_event->>'scenario_code' is distinct from v_expected->v_i->>0
         or v_event->>'event_type' is distinct from v_expected->v_i->>1
         or v_event->>'state' is distinct from v_expected->v_i->>2
         or v_event->>'side' is distinct from v_expected->v_i->>3 then
        v_errors := array_append(v_errors,'EVENT_CONTRACT_'||(v_i+1));
      end if;
      begin
        v_time := (v_event->>'event_at')::timestamptz;
        if jsonb_typeof(v_event->'event_at') is distinct from 'string'
           or (v_event->>'event_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
           or v_time is null or not isfinite(v_time)
           or (v_previous_time is not null and v_time < v_previous_time) then
          v_errors := array_append(v_errors,'EVENT_TIME_'||(v_i+1));
        end if;
        v_previous_time := v_time;
      exception when invalid_datetime_format or datetime_field_overflow then
        v_errors := array_append(v_errors,'EVENT_TIME_'||(v_i+1));
      end;
      -- JSON numbers only: missing, text, negative and NaN values fail closed.
      if v_i<7 then
        if jsonb_typeof(v_event->'requested_r') is distinct from 'number'
           or jsonb_typeof(v_event->'requested_price') is distinct from 'number' then
          v_errors := array_append(v_errors,'INVALID_REQUEST_'||(v_i+1));
        elsif (v_event->>'requested_r')::numeric<=0 or (v_event->>'requested_r')::numeric>1
           or (v_event->>'requested_price')::numeric<=0 then
          v_errors := array_append(v_errors,'INVALID_REQUEST_'||(v_i+1));
        end if;
      elsif v_event->'requested_r' is distinct from 'null'::jsonb
          or v_event->'requested_price' is distinct from 'null'::jsonb then
        v_errors := array_append(v_errors,'UNAUTHORIZED_REQUEST_FIELDS');
      end if;
      if v_i=2 then
        if jsonb_typeof(v_event->'simulated_fill_price') is distinct from 'number' then
          v_errors := array_append(v_errors,'INVALID_FILL');
        elsif (v_event->>'simulated_fill_price')::numeric<=0 then
          v_errors := array_append(v_errors,'INVALID_FILL');
        end if;
      elsif v_event->'simulated_fill_price' is distinct from 'null'::jsonb then
        v_errors := array_append(v_errors,'UNEXPECTED_FILL_'||(v_i+1));
      end if;
    end loop;
    -- One prepared order must account for both acknowledgement and fill.
    for v_i in 1..2 loop
      if p_events->v_i->'client_order_id' is distinct from p_events->0->'client_order_id'
         or p_events->v_i->'idempotency_key' is distinct from p_events->0->'idempotency_key'
         or p_events->v_i->'requested_r' is distinct from p_events->0->'requested_r'
         or p_events->v_i->'requested_price' is distinct from p_events->0->'requested_price' then
        v_errors := array_append(v_errors,'LIFECYCLE_CORRELATION_'||(v_i+1));
      end if;
    end loop;
    if p_events->3->'idempotency_key' is distinct from p_events->0->'idempotency_key'
       or p_events->3->'client_order_id' is not distinct from p_events->0->'client_order_id'
       or p_events->3->'payload'->'duplicate_of' is distinct from p_events->0->'client_order_id'
       or p_events->3->'requested_r' is distinct from p_events->0->'requested_r'
       or p_events->3->'requested_price' is distinct from p_events->0->'requested_price' then
      v_errors := array_append(v_errors,'DUPLICATE_CORRELATION');
    end if;
    if p_events->5->'client_order_id' is distinct from p_events->4->'client_order_id'
       or p_events->5->'idempotency_key' is distinct from p_events->4->'idempotency_key'
       or p_events->5->'requested_r' is distinct from p_events->4->'requested_r'
       or p_events->5->'requested_price' is distinct from p_events->4->'requested_price'
       or p_events->4->'payload'->'kill_switch' is distinct from 'true'::jsonb
       or p_events->5->'payload'->'kill_switch' is distinct from 'true'::jsonb then
      v_errors := array_append(v_errors,'KILL_SWITCH_CORRELATION');
    end if;
    if (select count(distinct e->>'client_order_id') from jsonb_array_elements(p_events) e)<>5
       or (select count(distinct e->>'idempotency_key') from jsonb_array_elements(p_events) e)<>4 then
      v_errors := array_append(v_errors,'CROSS_SCENARIO_ID_COLLISION');
    end if;
    if p_events->0->'payload'->>'route' is distinct from 'SIMULATED_ONLY'
       or coalesce(p_events->1->'payload'->>'broker_order_id','') not like 'SIM-%'
       or p_events->2->'payload'->>'fill_basis' is distinct from 'DETERMINISTIC_TEST_VECTOR'
       or p_events->6->'payload'->'live_route_present' is distinct from 'false'::jsonb
       or p_events->7->'payload'->'authorized' is distinct from 'false'::jsonb then
      v_errors := array_append(v_errors,'SIMULATION_BOUNDARY');
    end if;
  end if;
  v_pass := cardinality(v_errors)=0;
  return jsonb_build_object(
    'ok',v_pass,'version','v171-broker-lab-receipt-integrity-v1',
    'state',case when v_pass then 'PASS_SIMULATION_RECEIPT_INTEGRITY' else 'FAIL_CLOSED' end,
    'violations',to_jsonb(v_errors),'violation_count',cardinality(v_errors),
    'production_broker_readiness','NOT_TESTED','real_capital_permission','0R',
    'live_order_submission_enabled',false,'receipt_validation_only',true
  );
end;
$function$;
revoke all on function private.evaluate_v171_broker_lab_receipts(jsonb) from public,anon,authenticated;
grant execute on function private.evaluate_v171_broker_lab_receipts(jsonb) to service_role;

-- Keep immutable prior runs. A new suite seed creates an independent receipt.
-- Gate all six old labels on the semantic validator; never replace old receipts.
do $patch$
declare
  v_def text := pg_get_functiondef('public.run_v134_gold_broker_adapter_selftest()'::regprocedure);
  v_needle text := '  v_recon:=v_dry and v_orphans=0;';
begin
  if strpos(v_def,v_needle)=0 then raise exception 'V134 evaluation anchor missing'; end if;
  v_def := replace(v_def, 'v134-broker-adapter-lab-v1','v134-broker-adapter-lab-v2-receipt-integrity');
  v_def := replace(v_def, v_needle, $insert$
  if (private.evaluate_v171_broker_lab_receipts(
       (select jsonb_agg(to_jsonb(e) order by event_seq)
        from public.gold_broker_adapter_lab_events e where run_id=v_run_id)
     )->'ok') is distinct from 'true'::jsonb then
    v_dry:=false; v_idem:=false; v_kill:=false; v_live_denial:=false; v_unauth:=false;
  end if;
  v_recon:=v_dry and v_orphans=0;
$insert$);
  execute v_def;
end;
$patch$;
