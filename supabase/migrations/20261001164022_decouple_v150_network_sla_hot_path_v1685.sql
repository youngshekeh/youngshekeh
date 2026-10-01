alter function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb)
  rename to compute_v150_network_sla_evidence_from_v149;

create or replace function private.get_v150_network_sla_evidence_from_v149(v_v149 jsonb,v_v1461 jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
as $$
declare
  v_payload jsonb;
  v_refreshed_at timestamptz;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V150';

  if v_payload is null then
    return jsonb_build_object(
      'ok',false,
      'version','v168.5-v150-snapshot-wrapper-v1',
      'state','EVIDENCE_REFRESH_PENDING',
      'network_sla_cleared',false,
      'governance',jsonb_build_object(
        'action_permitted','WAIT',
        'capital_permission','0R',
        'live_order_routing',false,
        'automatic_rescheduling',false,
        'evidence_refresh_can_unlock_capital',false
      ),
      '_cache',jsonb_build_object('state','EMPTY_FAIL_CLOSED','refresh_mode','SCHEDULED_OUT_OF_BAND')
    );
  end if;

  return v_payload || jsonb_build_object(
    '_cache',jsonb_build_object(
      'state',case when v_refreshed_at>=now()-interval '20 minutes' then 'FRESH' else 'STALE_SURVIVOR' end,
      'refreshed_at',v_refreshed_at,
      'ttl_minutes',20,
      'refresh_mode','SCHEDULED_OUT_OF_BAND'
    )
  );
end;
$$;

create or replace function private.refresh_v150_network_sla_cache()
returns jsonb
language plpgsql
security definer
set search_path to 'public','private','pg_catalog','pg_temp'
set statement_timeout to '60s'
as $$
declare
  v_v149 jsonb;
  v_v1461 jsonb;
  v_payload jsonb;
  v_started timestamptz:=clock_timestamp();
  v_compute_ms numeric;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V150:REFRESH',0)) then
    return jsonb_build_object('ok',true,'state','REFRESH_ALREADY_RUNNING');
  end if;

  v_v149:=public.get_v149_dependency_isolation_shadow();
  v_v1461:=public.get_v1461_peak_spreader_status();
  v_payload:=private.compute_v150_network_sla_evidence_from_v149(v_v149,v_v1461);
  v_compute_ms:=round((extract(epoch from (clock_timestamp()-v_started))*1000)::numeric,1);

  insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
  values('V150',v_payload,now(),v_compute_ms,1)
  on conflict(engine_key) do update
  set payload=excluded.payload,refreshed_at=excluded.refreshed_at,
      compute_ms=excluded.compute_ms,
      refresh_count=private.scheduler_intelligence_cache.refresh_count+1;

  return jsonb_build_object('ok',true,'state','REFRESHED','compute_ms',v_compute_ms,'refreshed_at',now());
exception when others then
  return jsonb_build_object('ok',false,'state','REFRESH_FAILED','sqlstate',sqlstate);
end;
$$;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='tfa-v150-network-sla-cache-refresh' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'tfa-v150-network-sla-cache-refresh',
  '3,18,33,48 * * * *',
  $cron$select private.refresh_v150_network_sla_cache();$cron$
);
