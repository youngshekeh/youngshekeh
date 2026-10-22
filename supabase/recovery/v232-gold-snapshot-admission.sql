-- V232: guarded, reversible Gold snapshot admission relief.
-- DO NOT EXECUTE while the database admission path is timing out.
-- Only two existing jobs; same 5-minute weekday cadence; no disablement.
begin;
set local statement_timeout='12s';
set local lock_timeout='3s';
create table if not exists private.v232_gold_snapshot_phase_baseline(
  jobid bigint primary key,
  jobname text not null,
  command_fingerprint text not null,
  previous_schedule text not null,
  governed_schedule text not null,
  captured_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz
);
revoke all on private.v232_gold_snapshot_phase_baseline from public,anon,authenticated;
do $$
declare r record; v_count integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V232:GOLD_SNAPSHOT_PHASE',0)) then
    raise exception 'v232_recovery_lock_busy';
  end if;
  select count(*) into v_count from cron.job
  where (jobid=13 and jobname='gold-live-snapshot-5m')
     or (jobid=16 and jobname='live_markets_snapshot_capture');
  if v_count<>2 then raise exception 'v232_required_jobs_not_found'; end if;

  for r in
    select j.jobid,j.jobname,j.command,j.schedule,j.active,
      case when j.jobid=13 then '3-59/5 * * * 1-5'
           when j.jobid=16 then '4-59/5 * * * 1-5' end as desired
    from cron.job j where j.jobid in(13,16) order by j.jobid
  loop
    if r.active is not true then raise exception 'v232_target_job_not_active'; end if;
    if r.schedule not in ('*/5 * * * 1-5',r.desired) then
      raise exception 'v232_schedule_drift';
    end if;
    if exists(select 1 from private.v232_gold_snapshot_phase_baseline b
              where b.jobid=r.jobid and (b.command_fingerprint<>md5(r.command)
                or b.jobname<>r.jobname or b.governed_schedule<>r.desired)) then
      raise exception 'v232_command_or_baseline_drift';
    end if;
    if r.schedule='*/5 * * * 1-5' then
      insert into private.v232_gold_snapshot_phase_baseline
        (jobid,jobname,command_fingerprint,previous_schedule,governed_schedule,applied_at)
      values(r.jobid,r.jobname,md5(r.command),r.schedule,r.desired,now())
      on conflict(jobid) do update
        set applied_at=excluded.applied_at,rolled_back_at=null
      where private.v232_gold_snapshot_phase_baseline.command_fingerprint=excluded.command_fingerprint
        and private.v232_gold_snapshot_phase_baseline.previous_schedule=excluded.previous_schedule
        and private.v232_gold_snapshot_phase_baseline.governed_schedule=excluded.governed_schedule;
      perform cron.alter_job(job_id:=r.jobid,schedule:=r.desired);
    elsif not exists(select 1 from private.v232_gold_snapshot_phase_baseline b
      where b.jobid=r.jobid and b.governed_schedule=r.schedule and b.applied_at is not null) then
      raise exception 'v232_preexisting_schedule_without_baseline';
    end if;
  end loop;

  if (select count(*) from cron.job where (jobid=13 and active and schedule='3-59/5 * * * 1-5')
    or (jobid=16 and active and schedule='4-59/5 * * * 1-5'))<>2 then
    raise exception 'v232_schedule_verification_failed';
  end if;
end $$;
commit;
