-- V147 Connection Pressure Governor Shadow
-- Read-only pressure model. No cron changes, no pool configuration changes,
-- no order routing, no capital-permission changes.

create or replace function public.get_v147_connection_pressure_shadow()
returns jsonb
language plpgsql
security definer
set search_path to 'public','cron','pg_catalog','pg_temp'
as $function$
declare
  v_now timestamptz := now();
  v_max_connections integer := current_setting('max_connections')::int;
  v_reserved integer := current_setting('superuser_reserved_connections')::int;
  v_effective_capacity integer := greatest(v_max_connections-v_reserved,1);

  v_client integer := 0;
  v_active_client integer := 0;
  v_idle_client integer := 0;
  v_idle_tx integer := 0;
  v_active_pressure_waits integer := 0;
  v_lock_waits integer := 0;
  v_long_tx integer := 0;
  v_long_queries integer := 0;
  v_headroom integer := 0;
  v_util numeric := 0;

  v_cron_running integer := 0;
  v_cron_peak_15 integer := 0;
  v_cron_peak_60 integer := 0;
  v_cron_failures_15 integer := 0;
  v_cron_failures_60 integer := 0;

  v_score integer := 0;
  v_state text := 'NORMAL';
  v_actions jsonb := '[]'::jsonb;
  v_waits jsonb := '[]'::jsonb;
  v_v1461 jsonb := '{}'::jsonb;
begin
  select
    count(*) filter(where backend_type='client backend')::int,
    count(*) filter(where backend_type='client backend' and state='active')::int,
    count(*) filter(where backend_type='client backend' and state='idle')::int,
    count(*) filter(where backend_type='client backend' and state='idle in transaction')::int,
    count(*) filter(
      where backend_type='client backend'
        and state='active'
        and wait_event_type in ('Lock','IO','LWLock','BufferPin')
    )::int,
    count(*) filter(
      where backend_type='client backend'
        and xact_start is not null
        and v_now-xact_start>interval '30 seconds'
    )::int,
    count(*) filter(
      where backend_type='client backend'
        and state='active'
        and query_start is not null
        and v_now-query_start>interval '10 seconds'
    )::int
  into
    v_client,v_active_client,v_idle_client,v_idle_tx,
    v_active_pressure_waits,v_long_tx,v_long_queries
  from pg_stat_activity
  where pid<>pg_backend_pid();

  select count(*)::int
  into v_lock_waits
  from pg_locks
  where not granted;

  v_headroom := greatest(v_effective_capacity-v_client,0);
  v_util := round((100.0*v_client/v_effective_capacity)::numeric,2);

  select count(*)::int
  into v_cron_running
  from cron.job_run_details
  where status='running'
    and start_time>=v_now-interval '30 minutes';

  with r15 as (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_now-interval '15 minutes'
  ), e15 as (
    select start_time as ts,1 as delta from r15
    union all
    select end_time as ts,-1 as delta from r15
  ), s15 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e15
  ), r60 as (
    select runid,jobid,start_time,coalesce(end_time,v_now) as end_time,status
    from cron.job_run_details
    where start_time>=v_now-interval '60 minutes'
  ), e60 as (
    select start_time as ts,1 as delta from r60
    union all
    select end_time as ts,-1 as delta from r60
  ), s60 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e60
  )
  select
    coalesce((select max(concurrent) from s15),0)::int,
    coalesce((select max(concurrent) from s60),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int
  into
    v_cron_peak_15,v_cron_peak_60,v_cron_failures_15,v_cron_failures_60;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_waits
  from (
    select
      coalesce(wait_event_type,'NONE') as wait_event_type,
      coalesce(wait_event,'NONE') as wait_event,
      coalesce(state,'NONE') as state,
      count(*)::int as count
    from pg_stat_activity
    where pid<>pg_backend_pid()
    group by 1,2,3
    order by count desc
    limit 12
  ) x;

  begin
    v_v1461 := public.get_v1461_peak_spreader_status();
  exception when others then
    v_v1461 := jsonb_build_object('ok',false,'state','UNAVAILABLE');
  end;

  if v_util>=80 then v_score:=v_score+40;
  elsif v_util>=65 then v_score:=v_score+30;
  elsif v_util>=50 then v_score:=v_score+20;
  elsif v_util>=35 then v_score:=v_score+10;
  end if;

  if v_active_client>=15 then v_score:=v_score+15;
  elsif v_active_client>=8 then v_score:=v_score+10;
  elsif v_active_client>=4 then v_score:=v_score+5;
  end if;

  if v_lock_waits>0 then v_score:=v_score+20; end if;
  if v_idle_tx>0 then v_score:=v_score+10; end if;
  if v_long_tx>0 then v_score:=v_score+15; end if;
  if v_active_pressure_waits>0 then v_score:=v_score+10; end if;

  if v_cron_peak_15>16 then v_score:=v_score+20;
  elsif v_cron_peak_15>8 then v_score:=v_score+10;
  end if;

  if v_cron_failures_15>0 then v_score:=v_score+10; end if;

  v_score:=greatest(0,least(100,v_score));

  if v_score>=70 then v_state:='CRITICAL';
  elsif v_score>=50 then v_state:='HIGH';
  elsif v_score>=30 then v_state:='ELEVATED';
  else v_state:='NORMAL';
  end if;

  if v_util>=65 then
    v_actions:=v_actions || jsonb_build_array('REVIEW_CONNECTION_POOLING_AND_BACKEND_UTILIZATION');
  end if;
  if v_cron_peak_15>8 then
    v_actions:=v_actions || jsonb_build_array('CONTINUE_CRON_PHASE_REDUCTION_TOWARD_8_CONCURRENT');
  end if;
  if v_lock_waits>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_DATABASE_LOCK_WAITERS');
  end if;
  if v_idle_tx>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_IDLE_IN_TRANSACTION_SESSIONS');
  end if;
  if v_long_tx>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_LONG_TRANSACTIONS');
  end if;
  if v_cron_failures_15>0 then
    v_actions:=v_actions || jsonb_build_array('INSPECT_RECENT_CRON_FAILURES');
  end if;
  if jsonb_array_length(v_actions)=0 then
    v_actions:=jsonb_build_array('MAINTAIN_CURRENT_GOVERNED_LOAD_AND_OBSERVE');
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v147-connection-pressure-shadow-db-v1',
    'generated_at',v_now,
    'state',v_state,
    'pressure_score',v_score,
    'pressure_model',jsonb_build_object(
      'truth_label','DATABASE_BACKEND_PRESSURE_PROXY',
      'note','Client-backend utilization and database wait/cron telemetry are a pressure proxy; Supavisor pool occupancy is not directly measured here.'
    ),
    'connections',jsonb_build_object(
      'max_connections',v_max_connections,
      'reserved_connections',v_reserved,
      'effective_client_capacity',v_effective_capacity,
      'client_backends',v_client,
      'active_client_backends',v_active_client,
      'idle_client_backends',v_idle_client,
      'idle_in_transaction',v_idle_tx,
      'headroom',v_headroom,
      'utilization_pct',v_util,
      'active_pressure_waits',v_active_pressure_waits,
      'lock_waits',v_lock_waits,
      'long_transactions_over_30s',v_long_tx,
      'long_active_queries_over_10s',v_long_queries
    ),
    'cron_pressure',jsonb_build_object(
      'running_now',v_cron_running,
      'peak_concurrent_15m',v_cron_peak_15,
      'peak_concurrent_60m',v_cron_peak_60,
      'failures_15m',v_cron_failures_15,
      'failures_60m',v_cron_failures_60,
      'recommended_concurrent_ceiling',8
    ),
    'wait_distribution',v_waits,
    'v1461',jsonb_build_object(
      'state',v_v1461->>'state',
      'observation_minutes',v_v1461->'observation_minutes',
      'schedule_drift_jobs',v_v1461->'plan'->'schedule_drift_jobs',
      'failures_since_apply',v_v1461->'since_apply'->'failures'
    ),
    'actions',v_actions,
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'automatic_connection_throttling',false,
      'automatic_pool_reconfiguration',false,
      'automatic_rescheduling',false,
      'automatic_policy_promotion',false,
      'connection_pressure_can_unlock_capital',false
    ),
    'truth_label','CONNECTION_PRESSURE_SHADOW_NOT_TRADING_PERMISSION'
  );
end;
$function$;

revoke all on function public.get_v147_connection_pressure_shadow() from public;
revoke all on function public.get_v147_connection_pressure_shadow() from anon;
revoke all on function public.get_v147_connection_pressure_shadow() from authenticated;
grant execute on function public.get_v147_connection_pressure_shadow() to service_role;
