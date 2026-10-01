-- V178 Database Admission Recovery rollback
-- Restores only schedules captured before the first V178 application.

set local statement_timeout = '30s';

do $$
declare r record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('TFA:V178:DB_ADMISSION_RECOVERY',0)) then
    raise exception 'v178_recovery_lock_busy';
  end if;

  for r in
    select p.jobid,p.previous_schedule
    from private.v178_scheduler_recovery_plan p
    join cron.job j on j.jobid=p.jobid
    where j.schedule<>p.previous_schedule
    order by p.jobid
  loop
    perform cron.alter_job(job_id := r.jobid, schedule := r.previous_schedule);
  end loop;

  update private.v178_scheduler_recovery_plan
  set rolled_back_at=now();
end $$;
