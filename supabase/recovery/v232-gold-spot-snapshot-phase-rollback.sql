-- V232 EXACT ROLLBACK: restores only verified job 17 original schedule.
begin;
set local statement_timeout = '8s';
set local lock_timeout = '1500ms';
do $$
declare
  b record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V232:SNAPSHOT:PHASE',0)) then
    raise exception 'v232_scheduler_change_lock_busy';
  end if;
  select * into b from private.v232_snapshot_cron_phase_baseline
  where jobid=17 and rolled_back_at is null;
  if not found then raise exception 'v232_rollback_baseline_missing'; end if;
  if not exists(select 1 from cron.job
      where jobid=b.jobid and jobname=b.jobname and active=true
        and schedule=b.phased_schedule and md5(command)=b.command_fingerprint)
  then raise exception 'v232_rollback_drift_manual_review_required'; end if;
  perform cron.alter_job(b.jobid,schedule := b.previous_schedule);
  if not exists(select 1 from cron.job
      where jobid=b.jobid and jobname=b.jobname and active=true
        and schedule=b.previous_schedule and md5(command)=b.command_fingerprint)
  then raise exception 'v232_rollback_verification_failed'; end if;
  update private.v232_snapshot_cron_phase_baseline
    set rolled_back_at=now() where jobid=b.jobid;
end $$;
commit;
