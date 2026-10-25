-- V301 exact source rollback of job 44 start minutes.
DO $v301_rollback$
DECLARE v_job cron.job%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_job FROM cron.job WHERE jobid=44
    AND jobname='tfa-v70-autonomous-core';
  IF v_job.schedule <> '11,26,41,56 * * * *'
    OR v_job.command <> 'select public.refresh_autonomous_machine_state();'
    OR v_job.active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'V301 rollback drift: refuse changed core';
  END IF;
  PERFORM cron.alter_job(job_id := 44, schedule := '7-59/15 * * * *');
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobid=44
      AND schedule='7-59/15 * * * *'
      AND command='select public.refresh_autonomous_machine_state();'
      AND active=true
  ) THEN
    RAISE EXCEPTION 'V301 rollback did not restore original schedule';
  END IF;
END
$v301_rollback$;
