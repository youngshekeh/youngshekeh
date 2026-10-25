-- V301 single job core schedule stagger; no command / active / grants changes.
DO $v301$
DECLARE v_job cron.job%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_job FROM cron.job WHERE jobid=44
    AND jobname='tfa-v70-autonomous-core';
  IF v_job.schedule <> '7-59/15 * * * *'
    OR v_job.command <> 'select public.refresh_autonomous_machine_state();'
    OR v_job.active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'V301 drift: original autonomous core schedule/command/status mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobid=41
    AND jobname='tfa-autonomous-ops-watch'
    AND schedule='7,22,37,52 * * * *' AND active=true
  ) THEN
    RAISE EXCEPTION 'V301 drift: protected operations watch must remain intact';
  END IF;
  PERFORM cron.alter_job(job_id := 44, schedule := '11,26,41,56 * * * *');
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobid=44
      AND jobname='tfa-v70-autonomous-core'
      AND schedule='11,26,41,56 * * * *'
      AND command='select public.refresh_autonomous_machine_state();'
      AND active=true
  ) THEN
    RAISE EXCEPTION 'V301 postcondition failed: core schedule did not move safely';
  END IF;
END
$v301$;
