-- V178 Database Admission Recovery
-- Restores the already-approved V144/V144.1 governed scheduler phases after connection-pool saturation.
-- Scope: cron timing only. No command, signal, broker, order, portfolio, or capital-permission logic changes.

set local statement_timeout = '30s';

create table if not exists private.v178_scheduler_recovery_plan (
  jobname text primary key,
  jobid bigint not null,
  previous_schedule text not null,
  governed_schedule text not null,
  command text not null,
  active boolean not null,
  captured_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);

revoke all on private.v178_scheduler_recovery_plan from public, anon, authenticated;

do $$
declare
  r record;
  v_found integer := 0;
  v_changed integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V178:DB_ADMISSION_RECOVERY',0)) then
    raise exception 'v178_recovery_lock_busy';
  end if;

  insert into private.v178_scheduler_recovery_plan(
    jobname, jobid, previous_schedule, governed_schedule, command, active
  )
  with desired(jobname, governed_schedule) as (
    values
      ('tfa-v80-gold-state-capture','*/2 * * * *'),
      ('tfa-v119-gold-desk-capture','*/2 * * * *'),
      ('tfa-v84-research-components','1-59/2 * * * *'),
      ('tfa-v86-capital-permission-firewall','1-59/2 * * * *'),
      ('tfa-v132-gold-shadow-trader','1-59/2 * * * *'),
      ('tfa-v125-gold-signal-reputation','0-59/5 * * * *'),
      ('tfa-v127-gold-review-intelligence','0-59/5 * * * *'),
      ('tfa-v133-gold-shadow-portfolio','0-59/5 * * * *'),
      ('tfa-v128-gold-disagreement-intelligence','1-59/5 * * * *'),
      ('tfa-v130-gold-review-priority','1-59/5 * * * *'),
      ('tfa-v133-gold-execution-reality','1-59/5 * * * *'),
      ('tfa-v129-gold-contextual-disagreement','2-59/5 * * * *'),
      ('tfa-v131-gold-review-response-latency','2-59/5 * * * *'),
      ('tfa-v136-gold-paper-portfolio-ledger','2-59/5 * * * *'),
      ('tfa-v136-gold-execution-firewall','3-59/5 * * * *'),
      ('tfa-v1371-paper-risk-consensus','3-59/5 * * * *'),
      ('tfa-v136-gold-execution-qualification','4-59/5 * * * *'),
      ('tfa-v137-adaptive-paper-portfolio','4-59/5 * * * *'),
      ('tfa-v138-risk-challenger-evaluation','11,26,41,56 * * * *'),
      ('tfa-v84-research-reconcile','*/2 * * * *'),
      ('tfa-v122-gold-outcome-resolver','1-59/5 * * * *'),
      ('tfa-v89-market-memory-capture','1-59/5 * * * *'),
      ('tfa-v70-autonomous-core','2-59/5 * * * *'),
      ('tfa-v72-edge-load-shed-enforcer','3-59/5 * * * *'),
      ('tfa-enterprise-webhook-delivery','3-59/5 * * * *'),
      ('tfa-v74-public-autonomy-fabric','4-59/5 * * * *'),
      ('tfa-transactional-email-dispatch','4-59/5 * * * *'),
      ('tfa-synthesis-on-new-evidence','7,27,47 * * * *')
  )
  select j.jobname,j.jobid,j.schedule,d.governed_schedule,j.command,j.active
  from desired d
  join cron.job j on j.jobname=d.jobname
  on conflict(jobname) do nothing;

  select count(*) into v_found
  from private.v178_scheduler_recovery_plan;

  if v_found = 0 then
    raise exception 'v178_no_governed_jobs_found';
  end if;

  for r in
    select p.jobid,p.governed_schedule
    from private.v178_scheduler_recovery_plan p
    join cron.job j on j.jobid=p.jobid
    where j.active
      and j.schedule<>p.governed_schedule
    order by p.jobid
  loop
    perform cron.alter_job(job_id := r.jobid, schedule := r.governed_schedule);
    v_changed := v_changed + 1;
  end loop;

  update private.v178_scheduler_recovery_plan p
  set applied_at=coalesce(p.applied_at,now()),
      rolled_back_at=null
  where exists(select 1 from cron.job j where j.jobid=p.jobid and j.schedule=p.governed_schedule);

  raise log 'V178 scheduler recovery observed % governed jobs and changed % schedules', v_found, v_changed;
end $$;

create or replace function public.get_v178_scheduler_recovery_status()
returns jsonb
language sql
security definer
set search_path to 'public','private','cron','pg_catalog','pg_temp'
as $$
  with status as (
    select
      count(*)::int as tracked,
      count(*) filter(where j.active and j.schedule=p.governed_schedule)::int as compliant,
      count(*) filter(where j.jobid is null)::int as missing,
      count(*) filter(where j.jobid is not null and (not j.active or j.schedule<>p.governed_schedule))::int as drift
    from private.v178_scheduler_recovery_plan p
    left join cron.job j on j.jobid=p.jobid
  )
  select jsonb_build_object(
    'ok',true,
    'version','v178-database-admission-recovery-v1',
    'state',case
      when missing>0 then 'INCOMPLETE_JOB_DISCOVERY'
      when drift>0 then 'SCHEDULE_DRIFT_PRESENT'
      else 'GOVERNED_PHASES_COMPLIANT'
    end,
    'plan',jsonb_build_object(
      'tracked_jobs',tracked,
      'compliant_jobs',compliant,
      'missing_jobs',missing,
      'schedule_drift_jobs',drift
    ),
    'governance',jsonb_build_object(
      'action_permitted','WAIT',
      'capital_permission','0R',
      'live_order_routing',false,
      'order_submission_enabled',false,
      'automatic_real_capital',false,
      'automatic_rescheduling',false,
      'human_release_required',true,
      'scheduler_recovery_can_unlock_capital',false
    ),
    'truth_label','DATABASE_ADMISSION_RECOVERY_NOT_TRADING_PERMISSION'
  )
  from status;
$$;

revoke all on function public.get_v178_scheduler_recovery_status() from public, anon, authenticated;
grant execute on function public.get_v178_scheduler_recovery_status() to service_role;
