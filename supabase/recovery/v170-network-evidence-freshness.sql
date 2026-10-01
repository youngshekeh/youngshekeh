-- V170: bounded V150 reads with expiring evidence and current-schedule checks.
-- Requires the V168.5 out-of-band V150 refresh and scheduler_intelligence_cache.
-- No job schedules, observations, paper decisions, or capital controls are changed.
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $guard$
begin
  if md5(pg_get_functiondef('public.get_v150_network_sla_evidence_shadow()'::regprocedure))
       <> '7fd472c7b1d22c87ac8cf2cf9b41daf6'
     or md5(pg_get_functiondef('private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb)'::regprocedure))
       <> '0f6c8f1c77a792cde6515fe81500ef1e' then
    raise exception 'V150 source changed; inspect current definitions before applying V170';
  end if;
end;
$guard$;

create or replace function private.evaluate_v150_snapshot(
  p_payload jsonb,
  p_refreshed_at timestamptz,
  p_as_of timestamptz,
  p_current_jobs jsonb,
  p_v149 jsonb default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_payload jsonb := case when jsonb_typeof(p_payload)='object' then p_payload else '{}'::jsonb end;
  v_generated_at timestamptz;
  v_measured_at timestamptz;
  v_cache_state text := 'FRESH';
  v_state text;
  v_evidence jsonb := '[]'::jsonb;
  v_row jsonb;
  v_job jsonb;
  v_reason text;
  v_receipt_at timestamptz;
  v_receipt_age numeric;
  v_limit numeric;
  v_cleared integer := 0;
  v_invalidated integer := 0;
begin
  if p_payload is null or p_refreshed_at is null then
    v_cache_state := 'EMPTY_FAIL_CLOSED';
  elsif p_as_of is null or (v_payload->'ok') is distinct from 'true'::jsonb
     or jsonb_typeof(v_payload->'evidence') is distinct from 'array'
     or jsonb_typeof(p_current_jobs) is distinct from 'array' then
    v_cache_state := 'INVALID_FAIL_CLOSED';
  else
    begin
      v_generated_at := (v_payload->>'generated_at')::timestamptz;
      if v_generated_at is null or v_generated_at>p_as_of or p_refreshed_at>p_as_of then
        v_cache_state := 'INVALID_FAIL_CLOSED';
      else
        v_measured_at := least(v_generated_at,p_refreshed_at);
        if p_as_of>=v_measured_at+interval '20 minutes' then
          v_cache_state := 'STALE_FAIL_CLOSED';
        end if;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      v_cache_state := 'INVALID_FAIL_CLOSED';
    end;
  end if;

  for v_row in select value from jsonb_array_elements(
    case when jsonb_typeof(v_payload->'evidence')='array' then v_payload->'evidence' else '[]'::jsonb end
  ) loop
    v_reason := null;
    v_receipt_age := null;
    if (v_row->'network_sla_cleared')='true'::jsonb then
      if v_cache_state<>'FRESH' then
        v_reason := case when v_cache_state='STALE_FAIL_CLOSED' then 'EVIDENCE_STALE' else 'EVIDENCE_INVALID_SNAPSHOT' end;
      elsif (v_row->'protected_business') is distinct from 'false'::jsonb then
        v_reason := 'BLOCKED_PROTECTED_BUSINESS_WORKFLOW';
      else
        select value into v_job from jsonb_array_elements(p_current_jobs)
        where value->>'jobid'=v_row->>'jobid' and value->>'jobname'=v_row->>'jobname' limit 1;
        if v_job is null or (v_job->'active') is distinct from 'true'::jsonb
           or (v_job->>'schedule') is distinct from (v_row->>'schedule') then
          v_reason := 'EVIDENCE_SCHEDULE_CHANGED';
        elsif p_v149 is not null and not exists (
          select 1 from jsonb_array_elements(
            case when jsonb_typeof(p_v149->'audits')='array' then p_v149->'audits' else '[]'::jsonb end
          ) a where a.value->>'jobname'=v_row->>'jobname'
            and a.value->>'dependency_verdict'='REVIEW_NETWORK_SLA_AND_FAILURE_ISOLATION'
            and a.value->'direct_network_io'='true'::jsonb
            and p_v149->'ok'='true'::jsonb
        ) then
          v_reason := 'BLOCKED_UPSTREAM_DEPENDENCY_VERDICT';
        else
          begin
            v_receipt_at := (v_row->>'latest_receipt_started_at')::timestamptz;
            v_limit := (v_row->>'freshness_limit_minutes')::numeric;
            v_receipt_age := extract(epoch from (p_as_of-v_receipt_at))/60.0;
            if v_receipt_at is null or v_limit is null or v_limit<=0
               or v_limit::text in ('NaN','Infinity','-Infinity')
               or v_receipt_age<0 or v_receipt_age>v_limit then
              v_reason := 'EVIDENCE_STALE';
            end if;
          exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
            v_reason := 'EVIDENCE_INVALID_RECEIPT';
          end;
        end if;
      end if;
      if v_reason is not null then
        v_invalidated := v_invalidated+1;
        v_row := v_row || jsonb_build_object(
          'snapshot_evidence_verdict',v_row->>'evidence_verdict',
          'evidence_verdict',v_reason,'network_sla_cleared',false
        );
      else
        v_cleared := v_cleared+1;
      end if;
    end if;
    v_row := v_row || jsonb_build_object('apply',false,'requires_human_review',true,
      'network_sla_cleared',coalesce(v_row->'network_sla_cleared'='true'::jsonb,false));
    if v_receipt_age is not null then
      v_row := v_row || jsonb_build_object('latest_receipt_age_minutes',round(v_receipt_age,2));
    end if;
    v_evidence := v_evidence || jsonb_build_array(v_row);
  end loop;

  v_state := case
    when v_cache_state='EMPTY_FAIL_CLOSED' then 'EVIDENCE_REFRESH_PENDING'
    when v_cache_state='STALE_FAIL_CLOSED' then 'EVIDENCE_STALE'
    when v_cache_state='INVALID_FAIL_CLOSED' then 'EVIDENCE_INVALID_SNAPSHOT'
    when v_cleared=0 then 'NO_NETWORK_SLA_CANDIDATE_CLEARED'
    else coalesce(v_payload->>'state','NETWORK_SLA_CANDIDATES_READY_FOR_CONTROLLED_PLAN_REVIEW') end;

  return v_payload || jsonb_build_object(
    'ok',v_cache_state='FRESH',
    'version','v170-network-sla-snapshot-freshness-db-v1',
    'source_engine_version',v_payload->>'version',
    'state',v_state,
    'evaluated_at',p_as_of,
    'network_sla_cleared',v_cleared>0,
    'evidence',v_evidence,
    'summary',(case when jsonb_typeof(v_payload->'summary')='object' then v_payload->'summary' else '{}'::jsonb end)
      || jsonb_build_object('network_sla_cleared_candidates',v_cleared,'invalidated_cached_candidates',v_invalidated),
    'governance',(case when jsonb_typeof(v_payload->'governance')='object' then v_payload->'governance' else '{}'::jsonb end)
      || jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_routing',false,
        'automatic_rescheduling',false,'automatic_pool_reconfiguration',false,'automatic_policy_promotion',false,
        'network_sla_evidence_can_unlock_capital',false),
    '_cache',jsonb_build_object('state',v_cache_state,'refreshed_at',p_refreshed_at,'measured_at',v_measured_at,
      'expires_at',v_measured_at+interval '20 minutes','ttl_minutes',20,
      'refresh_mode','SCHEDULED_OUT_OF_BAND','history_scanned_on_read',false)
  );
end;
$function$;

revoke all on function private.evaluate_v150_snapshot(jsonb,timestamptz,timestamptz,jsonb,jsonb) from public,anon,authenticated;

create or replace function private.get_v150_network_sla_evidence_from_v149(v_v149 jsonb, v_v1461 jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_payload jsonb;
  v_refreshed_at timestamptz;
  v_jobs jsonb;
begin
  select payload,refreshed_at into v_payload,v_refreshed_at
  from private.scheduler_intelligence_cache where engine_key='V150';
  select coalesce(jsonb_agg(jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule,'active',active)),'[]'::jsonb)
  into v_jobs from cron.job;
  return private.evaluate_v150_snapshot(v_payload,v_refreshed_at,clock_timestamp(),v_jobs,v_v149);
end;
$function$;

revoke all on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.get_v150_network_sla_evidence_from_v149(jsonb,jsonb) to service_role;

create or replace function public.get_v150_network_sla_evidence_shadow()
returns jsonb
language sql
security definer
set search_path to 'pg_catalog','pg_temp'
as $function$
  select private.get_v150_network_sla_evidence_from_v149(null::jsonb,null::jsonb);
$function$;

revoke all on function public.get_v150_network_sla_evidence_shadow() from public,anon,authenticated;
grant execute on function public.get_v150_network_sla_evidence_shadow() to service_role;
