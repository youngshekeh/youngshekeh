-- V142.1 runtime recovery database fixes
-- Mirrors the production CREATE OR REPLACE definitions applied on 2026-09-30.
-- These are recovery source records, not an automatic migration.
-- Invariants: recovery may restore infrastructure health; it cannot promote trading policy or capital permission.

CREATE OR REPLACE FUNCTION public.reconcile_v70_quota_probes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net', 'pg_temp'
AS $function$
declare
  p record;
  r record;
  v_body jsonb;
  v_recovered boolean;
  v_resolved integer := 0;
  v_recovered_count integer := 0;
begin
  for p in
    select id,request_id
    from public.autonomous_external_probes
    where probe_kind = 'supabase_public_quota'
      and resolved_at is null
      and requested_at <= now() - interval '3 seconds'
    order by requested_at asc
    limit 20
  loop
    select status_code, content, timed_out, error_msg
    into r
    from net._http_response
    where id = p.request_id
    order by created desc
    limit 1;

    if not found then
      continue;
    end if;

    begin
      v_body := coalesce(r.content,'{}')::jsonb;
    exception when others then
      v_body := jsonb_build_object('raw',left(coalesce(r.content,''),500));
    end;

    v_recovered :=
      coalesce(r.status_code,0) = 200
      and coalesce((v_body->>'canonical_upstream_ok')::boolean,false) = true
      and coalesce((v_body->>'restricted')::boolean,true) = false;

    update public.autonomous_external_probes
    set resolved_at=now(),
        http_status=r.status_code,
        ok=v_recovered,
        details=jsonb_build_object(
          'timed_out',coalesce(r.timed_out,false),
          'error_msg',r.error_msg,
          'response',v_body
        )
    where id=p.id;

    v_resolved := v_resolved + 1;
    if v_recovered then
      v_recovered_count := v_recovered_count + 1;
    end if;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:edge_quota_restricted',
      case when v_recovered then 'watch' else 'critical' end,
      'platform',
      case when v_recovered then 'cleared' else 'open' end,
      'Supabase public runtime quota state',
      case when v_recovered
        then 'V70 recovery probe confirmed canonical Supabase public API access has returned.'
        else format('V70 recovery probe still sees the Supabase public runtime restricted or unavailable (upstream %s).',coalesce(v_body->>'upstream_status',r.status_code::text,'unknown'))
      end,
      jsonb_build_object(
        'probe_request_id',p.request_id,
        'http_status',r.status_code,
        'canonical_upstream_ok',coalesce(v_body->>'canonical_upstream_ok','false'),
        'restricted',coalesce(v_body->>'restricted','true'),
        'probe_version',v_body->>'version'
      ),
      now(),
      case when v_recovered then now() else null end,
      now()
    )
    on conflict (event_key) do update set
      severity=excluded.severity,
      category=excluded.category,
      state=excluded.state,
      title=excluded.title,
      summary=excluded.summary,
      details=excluded.details,
      observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,
      updated_at=excluded.updated_at;
  end loop;

  perform public.refresh_autonomous_machine_state();

  return jsonb_build_object(
    'ok',true,
    'resolved',v_resolved,
    'recovered',v_recovered_count,
    'checked_at',now()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_v72_edge_load_shedding(p_pause boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  j record;
  s record;
  v_changed integer := 0;
  v_targets text[] := array[
    'gold-live-snapshot-5m',
    'live_markets_snapshot_capture',
    'gold_spot_snapshot_capture',
    'gold_spot_shadow_capture',
    'gold_signal_resolution_finalize',
    'tfa-production-smoke-sweep',
    'tfa-autonomous-ops-watch'
  ];
begin
  if p_pause then
    for j in
      select jobid,jobname,active
      from cron.job
      where jobname = any(v_targets)
    loop
      insert into public.autonomous_cron_guard_state(
        jobname,paused_by_guard,was_active_before_pause,last_changed_at,reason
      ) values (
        j.jobname,true,j.active,now(),'Supabase public Edge runtime quota restricted'
      )
      on conflict(jobname) do update set
        was_active_before_pause = case
          when public.autonomous_cron_guard_state.paused_by_guard then public.autonomous_cron_guard_state.was_active_before_pause
          else excluded.was_active_before_pause
        end,
        paused_by_guard=true,
        last_changed_at=now(),
        reason=excluded.reason;

      if j.active then
        perform cron.alter_job(job_id:=j.jobid,active:=false);
        v_changed := v_changed + 1;
      end if;
    end loop;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v72_load_shedding','important','automation','open',
      'V72 Edge load shedding active',
      format('Paused %s nonessential high-frequency Edge cron job(s) while Supabase public runtime is quota-restricted.',v_changed),
      jsonb_build_object('targets',to_jsonb(v_targets),'changed',v_changed),
      now(),null,now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=null,updated_at=excluded.updated_at;
  else
    for s in
      select g.jobname,g.was_active_before_pause,cj.jobid,cj.active
      from public.autonomous_cron_guard_state g
      join cron.job cj on cj.jobname=g.jobname
      where g.paused_by_guard=true
    loop
      if s.was_active_before_pause and not s.active then
        perform cron.alter_job(job_id:=s.jobid,active:=true);
        v_changed := v_changed + 1;
      end if;

      update public.autonomous_cron_guard_state
      set paused_by_guard=false,last_changed_at=now(),reason='Supabase public runtime recovery confirmed'
      where jobname=s.jobname;
    end loop;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v72_load_shedding','watch','automation','cleared',
      'V72 Edge load shedding cleared',
      format('Recovery confirmed. Restored %s previously active Edge cron job(s).',v_changed),
      jsonb_build_object('restored',v_changed),
      now(),now(),now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,updated_at=excluded.updated_at;
  end if;

  return jsonb_build_object(
    'ok',true,
    'pause_requested',p_pause,
    'changed_jobs',v_changed,
    'checked_at',now()
  );
end;
$function$;
