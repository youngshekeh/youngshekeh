-- V137 control/challenger reconciliation
-- V133 remains the fixed-1R control. V137 remains a separate adaptive challenger.
-- Remove only the superseded duplicate schedule if it exists. Preserve audit history.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='tfa-v137-gold-paper-risk-governor'
  limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;
