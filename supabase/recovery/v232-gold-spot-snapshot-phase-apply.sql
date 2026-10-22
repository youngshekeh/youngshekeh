-- V232 CONTROLLED APPLY: NOT AUTOMATIC. Schedule-only, exactly one source snapshot job.
-- Preconditions outside SQL: three consecutive healthy DB probes and no 10-minute timeouts.
-- No changes to job 13/16/21/39/95, any active flags, cron commands, trading or billing.
begin;
set local statement_timeout = '8s';
set local lock_timeout = '1500ms';

create table if not exists private.v232_snapshot_cron_phase_baseline (
  jobid bigint primary key,
  jobname text not null,
  command_fingerprint text not null,
  previous_schedule text not null,
  phased_schedule text not null,
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);
revoke all on private.v232_snapshot_cron_phase_baseline from public,anon,authenticated,service_role;

do $$
declare
  t record;
  v_count integer;
  v_seal jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V232:SNAPSHOT:PHASE',0)) then
    raise exception 'v232_scheduler_change_lock_busy';
  end if;

  -- Require the real existing database security seal. No cached readiness.
  v_seal:=public.command_kernel_seal_status();
  if coalesce(v_seal->>'sealed','false') <> 'true' then
    raise exception 'v232_kernel_seal_not_verified';
  end if;

  select count(*) into v_count
  from cron.job
  where active=true and
    (jobid=13 and jobname='gold-live-snapshot-5m'
     or jobid=16 and jobname='live_markets_snapshot_capture'
     or jobid=17 and jobname='gold_spot_snapshot_capture'
     or jobid=20 and jobname='gold_spot_shadow_capture'
     or jobid=21 and jobname='gold_signal_resolution_finalize'
     or jobid=39 and jobname='tfa-transactional-email-dispatch'
     or jobid=95 and jobname='tfa-v136-gold-execution-firewall');
  if v_count<>7 then raise exception 'v232_protected_cron_inventory_drift'; end if;

  -- Fail closed: the existing downstream shadow capture fires at minute 1.
  -- Rephasing its source into the same minute can create a source/consumer race.
  if exists(select 1 from cron.job where jobid=20
    and jobname='gold_spot_shadow_capture' and active=true
    and schedule='1-59/5 * * * 1-5') then
    raise exception 'v232_gold_source_shadow_phase_collision';
  end if;

  select * into t from cron.job
  where jobid=17 and jobname='gold_spot_snapshot_capture'
    and active=true and schedule='*/5 * * * 1-5';
  if not found then raise exception 'v232_gold_spot_schedule_drift'; end if;
  if exists(select 1 from private.v232_snapshot_cron_phase_baseline where jobid=17) then
    raise exception 'v232_baseline_already_exists_manual_review_required';
  end if;
  insert into private.v232_snapshot_cron_phase_baseline
    (jobid,jobname,command_fingerprint,previous_schedule,phased_schedule)
  values (17,t.jobname,md5(t.command),t.schedule,'1-59/5 * * * 1-5');

  perform cron.alter_job(17,schedule := '1-59/5 * * * 1-5');

  if not exists (
    select 1 from cron.job where jobid=17 and active=true
      and jobname='gold_spot_snapshot_capture'
      and schedule='1-59/5 * * * 1-5' and md5(command)=md5(t.command)
  ) then raise exception 'v232_cron_phase_verification_failed'; end if;
end $$;
commit;
