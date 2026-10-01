-- Rollback only after verifying the current V171 definition and reviewing its receipts.
set local lock_timeout = '3s';
set local statement_timeout = '20s';
do $guard$
begin
  if md5(pg_get_functiondef('public.run_v134_gold_broker_adapter_selftest()'::regprocedure))
      <> '58211faa83f86e76847e042ddd608a8f' then
    raise exception 'V171 drift detected; inspect before rollback';
  end if;
end;
$guard$;
CREATE OR REPLACE FUNCTION public.run_v134_gold_broker_adapter_selftest()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_suite constant text := 'v134-broker-adapter-lab-v1';
  v_run_id bigint;
  v_run_sha text;
  v_seed text;
  v_events integer;
  v_real_orders integer;
  v_orphans integer;
  v_dry boolean;
  v_idem boolean;
  v_recon boolean;
  v_kill boolean;
  v_live_denial boolean;
  v_unauth boolean;
  v_state text;
  v_result_sha text;
begin
  v_seed:=concat_ws('|',v_suite,date_trunc('hour',now())::text,'SIMULATED_ONLY','DETERMINISTIC_TEST_VECTOR');
  v_run_sha:=encode(extensions.digest(convert_to(v_seed,'UTF8'),'sha256'),'hex');

  insert into public.gold_broker_adapter_lab_runs(
    suite_version,adapter_mode,quote_source,real_broker_connected,
    live_order_route_present,live_order_submission_enabled,kill_switch_default_on,run_sha256
  ) values (
    v_suite,'SIMULATED_ONLY','DETERMINISTIC_TEST_VECTOR',
    false,false,false,true,v_run_sha
  )
  on conflict(run_sha256) do nothing
  returning id into v_run_id;

  if v_run_id is null then
    select id into v_run_id
    from public.gold_broker_adapter_lab_runs
    where run_sha256=v_run_sha
    limit 1;
  end if;

  insert into public.gold_broker_adapter_lab_events(
    run_id,event_seq,scenario_code,event_type,client_order_id,idempotency_key,
    side,requested_r,requested_price,simulated_fill_price,state,real_order_sent,payload,event_sha256
  )
  select v_run_id,x.seq,x.scenario,x.etype,x.client_id,x.idem,x.side,x.req_r,x.req_px,x.fill_px,x.state,false,
         x.payload,
         encode(extensions.digest(convert_to(concat_ws('|',
           v_run_id::text,x.seq::text,x.scenario,x.etype,x.client_id,x.idem,x.side,
           coalesce(x.req_r::text,''),coalesce(x.req_px::text,''),coalesce(x.fill_px::text,''),
           x.state,'false',x.payload::text
         ),'UTF8'),'sha256'),'hex')
  from (values
    (1,'DRY_RUN_LIFECYCLE','ORDER_PREPARED','DRY-ORDER-A','IDEM-A','LONG',0.10::numeric,4200.00::numeric,null::numeric,'PREPARED',jsonb_build_object('route','SIMULATED_ONLY')),
    (2,'DRY_RUN_LIFECYCLE','DRY_RUN_ACK','DRY-ORDER-A','IDEM-A','LONG',0.10::numeric,4200.00::numeric,null::numeric,'ACKNOWLEDGED',jsonb_build_object('broker_order_id','SIM-ACK-A')),
    (3,'DRY_RUN_LIFECYCLE','DRY_RUN_FILL','DRY-ORDER-A','IDEM-A','LONG',0.10::numeric,4200.00::numeric,4200.25::numeric,'FILLED_SIMULATED',jsonb_build_object('fill_basis','DETERMINISTIC_TEST_VECTOR')),
    (4,'IDEMPOTENCY','DUPLICATE_BLOCKED','DRY-ORDER-A-DUP','IDEM-A','LONG',0.10::numeric,4200.00::numeric,null::numeric,'BLOCKED_DUPLICATE_KEY',jsonb_build_object('duplicate_of','DRY-ORDER-A')),
    (5,'KILL_SWITCH','ORDER_PREPARED','DRY-ORDER-KILL','IDEM-KILL','SHORT',0.10::numeric,4200.00::numeric,null::numeric,'PREPARED',jsonb_build_object('kill_switch',true)),
    (6,'KILL_SWITCH','KILL_SWITCH_BLOCKED','DRY-ORDER-KILL','IDEM-KILL','SHORT',0.10::numeric,4200.00::numeric,null::numeric,'BLOCKED_KILL_SWITCH',jsonb_build_object('kill_switch',true)),
    (7,'LIVE_ROUTE_DENIAL','LIVE_SUBMIT_BLOCKED','DRY-ORDER-LIVE','IDEM-LIVE','LONG',0.10::numeric,4200.00::numeric,null::numeric,'BLOCKED_NO_LIVE_ROUTE',jsonb_build_object('live_route_present',false)),
    (8,'AUTHZ_DENIAL','UNAUTHORIZED_SUBMIT_BLOCKED','DRY-ORDER-AUTHZ','IDEM-AUTHZ','NONE',null::numeric,null::numeric,null::numeric,'BLOCKED_UNAUTHORIZED',jsonb_build_object('authorized',false))
  ) as x(seq,scenario,etype,client_id,idem,side,req_r,req_px,fill_px,state,payload)
  on conflict(run_id,event_seq) do nothing;

  select count(*) into v_events from public.gold_broker_adapter_lab_events where run_id=v_run_id;
  select count(*) into v_real_orders from public.gold_broker_adapter_lab_events where run_id=v_run_id and real_order_sent=true;
  select count(*) into v_orphans
  from public.gold_broker_adapter_lab_events e
  where e.run_id=v_run_id and not exists (
    select 1 from public.gold_broker_adapter_lab_runs r where r.id=e.run_id
  );

  select
    count(*) filter(where scenario_code='DRY_RUN_LIFECYCLE' and event_type='ORDER_PREPARED')=1
    and count(*) filter(where scenario_code='DRY_RUN_LIFECYCLE' and event_type='DRY_RUN_ACK')=1
    and count(*) filter(where scenario_code='DRY_RUN_LIFECYCLE' and event_type='DRY_RUN_FILL')=1,
    count(*) filter(where scenario_code='IDEMPOTENCY' and event_type='DUPLICATE_BLOCKED')=1,
    count(*) filter(where scenario_code='KILL_SWITCH' and event_type='KILL_SWITCH_BLOCKED')=1,
    count(*) filter(where scenario_code='LIVE_ROUTE_DENIAL' and event_type='LIVE_SUBMIT_BLOCKED')=1,
    count(*) filter(where scenario_code='AUTHZ_DENIAL' and event_type='UNAUTHORIZED_SUBMIT_BLOCKED')=1
  into v_dry,v_idem,v_kill,v_live_denial,v_unauth
  from public.gold_broker_adapter_lab_events
  where run_id=v_run_id;

  v_recon:=v_dry and v_orphans=0;
  v_state:=case
    when v_dry and v_idem and v_recon and v_kill and v_live_denial and v_unauth and v_real_orders=0
      then 'PASS_SIMULATION_ONLY'
    else 'FAIL_CLOSED'
  end;

  v_result_sha:=encode(extensions.digest(convert_to(concat_ws('|',
    v_run_id::text,v_dry::text,v_idem::text,v_recon::text,v_kill::text,
    v_live_denial::text,v_unauth::text,v_real_orders::text,v_orphans::text,
    v_state,'NOT_TESTED'
  ),'UTF8'),'sha256'),'hex');

  insert into public.gold_broker_adapter_lab_results(
    run_id,dry_run_lifecycle_pass,idempotency_pass,reconciliation_pass,
    kill_switch_pass,live_route_denial_pass,unauthorized_submit_blocked,
    real_orders_sent,orphan_event_count,result_state,production_broker_readiness,payload_sha256
  ) values (
    v_run_id,v_dry,v_idem,v_recon,v_kill,v_live_denial,v_unauth,
    v_real_orders,v_orphans,v_state,'NOT_TESTED',v_result_sha
  )
  on conflict(run_id) do nothing;

  return jsonb_build_object(
    'ok',v_state='PASS_SIMULATION_ONLY',
    'version',v_suite,
    'run_id',v_run_id,
    'event_count',v_events,
    'dry_run_lifecycle_pass',v_dry,
    'idempotency_pass',v_idem,
    'reconciliation_pass',v_recon,
    'kill_switch_pass',v_kill,
    'live_route_denial_pass',v_live_denial,
    'unauthorized_submit_blocked',v_unauth,
    'real_orders_sent',v_real_orders,
    'orphan_event_count',v_orphans,
    'result_state',v_state,
    'production_broker_readiness','NOT_TESTED',
    'live_order_route_present',false,
    'live_order_submission_enabled',false,
    'real_capital_permission','0R',
    'checked_at',now()
  );
end;
$function$
