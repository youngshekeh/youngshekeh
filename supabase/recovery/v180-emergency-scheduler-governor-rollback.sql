-- V180 Emergency Scheduler Governor rollback
-- Restores only schedules captured by private.v180_emergency_scheduler_baseline.
-- Does not grant trading/capital permission.

begin;

select pg_advisory_xact_lock(hashtextextended('TFA:V180:EMERGENCY:SCHEDULER',0));

do $$
declare r record;
begin
  if to_regclass('private.v180_emergency_scheduler_baseline') is null then
    raise exception 'v180_emergency_scheduler_baseline_missing';
  end if;

  for r in
    select jobid,previous_schedule
    from private.v180_emergency_scheduler_baseline
    where applied_at is not null
    order by jobid
  loop
    perform cron.alter_job(r.jobid,schedule := r.previous_schedule);
  end loop;
end $$;

commit;
