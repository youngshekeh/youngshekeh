-- V144 emergency rollback.
-- Restores only the 19 schedules captured before V144. Commands and active state are not changed.

do $$
declare
  r record;
begin
  if not exists(select 1 from private.v144_scheduler_plan) then
    raise exception 'v144_plan_missing';
  end if;

  for r in
    select jobid,previous_schedule
    from private.v144_scheduler_plan
    order by stage desc,jobid
  loop
    perform cron.alter_job(r.jobid, schedule := r.previous_schedule);
  end loop;

  update private.v144_scheduler_plan
  set applied_at=null,
      updated_at=now();
end $$;
