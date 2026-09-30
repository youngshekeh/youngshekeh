-- V137 control/challenger reconciliation
-- V133 remains the fixed-1R control. V137 is an independent adaptive challenger.
-- This migration only removes the superseded duplicate governor schedule if it exists.
-- It does not delete audit history or mutate existing portfolio decisions.

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

-- Production invariant after reconciliation:
--   tfa-v133-gold-shadow-portfolio      = fixed 1R control
--   tfa-v137-adaptive-paper-portfolio   = adaptive challenger
--   live trading                         = false
--   order submission                     = false
--   real capital permission              = 0R
