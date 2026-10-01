-- V151.1 Controlled Anomaly-Watch Shift rollback
-- Restores exactly the schedule captured by V151.1.

do $$
declare
  v_jobid bigint;
  v_current_schedule text;
begin
  select j.jobid,j.schedule
  into v_jobid,v_current_schedule
  from cron.job j
  where j.jobname='tfa-owner-anomaly-watch';

  if v_jobid is null then
    raise exception 'v1511_rollback_target_missing';
  end if;

  if not exists(
    select 1 from private.v1511_controlled_shift_ledger
    where plan_id='V1511_OWNER_ANOMALY_SHIFT_001'
      and jobid=v_jobid
      and previous_schedule='12,42 * * * *'
      and governed_schedule='13,43 * * * *'
  ) then
    raise exception 'v1511_rollback_ledger_missing';
  end if;

  if v_current_schedule not in ('12,42 * * * *','13,43 * * * *') then
    raise exception 'v1511_rollback_refuses_unknown_drift_%',v_current_schedule;
  end if;

  perform cron.alter_job(
    job_id := v_jobid,
    schedule := '12,42 * * * *'
  );

  update private.v1511_controlled_shift_ledger
  set rolled_back_at=now(),
      updated_at=now()
  where plan_id='V1511_OWNER_ANOMALY_SHIFT_001';
end $$;
