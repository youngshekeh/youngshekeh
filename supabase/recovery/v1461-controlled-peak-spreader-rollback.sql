-- V146.1 Controlled Peak-Minute Spreader rollback
-- Restores only the three schedules captured before V146.1.

do $$
declare
  v_count integer;
  v_bad integer;
  r record;
begin
  select count(*) into v_count from private.v1461_peak_spreader_plan;
  if v_count<>3 then
    raise exception 'v1461_rollback_expected_3_plan_rows_found_%',v_count;
  end if;

  select count(*) into v_bad
  from private.v1461_peak_spreader_plan p
  join cron.job j on j.jobid=p.jobid
  where j.schedule not in (p.governed_schedule,p.previous_schedule);

  if v_bad>0 then
    raise exception 'v1461_rollback_refuses_unknown_schedule_drift_%',v_bad;
  end if;

  for r in
    select jobid,previous_schedule
    from private.v1461_peak_spreader_plan
    order by jobid
  loop
    perform cron.alter_job(job_id := r.jobid, schedule := r.previous_schedule);
  end loop;

  update private.v1461_peak_spreader_plan
  set rolled_back_at=now(),
      updated_at=now();
end $$;
