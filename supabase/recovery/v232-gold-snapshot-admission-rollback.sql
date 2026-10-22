-- V232: exact rollback. Refuse to overwrite later edits or altered commands.
begin;
set local statement_timeout='12s';
set local lock_timeout='3s';
do $$
declare r record; n integer;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V232:GOLD_SNAPSHOT_PHASE',0)) then
    raise exception 'v232_recovery_lock_busy';
  end if;
  if to_regclass('private.v232_gold_snapshot_phase_baseline') is null then
    raise exception 'v232_baseline_missing';
  end if;
  select count(*) into n from private.v232_gold_snapshot_phase_baseline
  where jobid in(13,16) and applied_at is not null;
  if n<>2 then raise exception 'v232_applied_baseline_incomplete'; end if;
  for r in select b.jobid,b.jobname,b.command_fingerprint,b.previous_schedule,
          b.governed_schedule,j.schedule as current_schedule,j.command,j.active,j.jobname as current_name
    from private.v232_gold_snapshot_phase_baseline b
    join cron.job j on j.jobid=b.jobid
    where b.jobid in(13,16) and b.applied_at is not null
    order by b.jobid
  loop
    if r.active is not true or r.current_name<>r.jobname
      or md5(r.command)<>r.command_fingerprint
      or r.current_schedule not in (r.previous_schedule,r.governed_schedule) then
      raise exception 'v232_rollback_job_drift';
    end if;
    if r.current_schedule=r.governed_schedule then
      perform cron.alter_job(job_id:=r.jobid,schedule:=r.previous_schedule);
    end if;
  end loop;
  update private.v232_gold_snapshot_phase_baseline
  set rolled_back_at=now()
  where jobid in(13,16) and applied_at is not null;
end $$;
commit;
