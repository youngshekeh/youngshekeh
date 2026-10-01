-- V157 Controlled Member-Alert Sync Shift rollback
-- Restores exactly the schedule captured by V157.

do $$
declare
  v_jobid bigint;
  v_current_schedule text;
begin
  select j.jobid,j.schedule
  into v_jobid,v_current_schedule
  from cron.job j
  where j.jobname='tfa-member-alert-sync';

  if v_jobid is null then
    raise exception 'v157_rollback_target_missing';
  end if;

  if not exists(
    select 1 from private.v157_controlled_shift_ledger
    where plan_id='V157_MEMBER_ALERT_SHIFT_001'
      and jobid=v_jobid
      and previous_schedule='50 * * * *'
      and governed_schedule='49 * * * *'
  ) then
    raise exception 'v157_rollback_ledger_missing';
  end if;

  if v_current_schedule not in ('50 * * * *','49 * * * *') then
    raise exception 'v157_rollback_refuses_unknown_drift_%',v_current_schedule;
  end if;

  perform cron.alter_job(
    job_id := v_jobid,
    schedule := '50 * * * *'
  );

  update private.v157_controlled_shift_ledger
  set rolled_back_at=now(),
      updated_at=now()
  where plan_id='V157_MEMBER_ALERT_SHIFT_001';
end $$;
