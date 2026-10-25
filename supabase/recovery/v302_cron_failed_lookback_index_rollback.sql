-- V302 rollback only if exact index identity/definition is present.
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='8s';
DO $v302_rb$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_index i
   JOIN pg_class c ON c.oid=i.indexrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='cron' AND c.relname='v302_failed_runs_by_time_idx'
     AND pg_get_indexdef(i.indexrelid) LIKE
      'CREATE INDEX v302_failed_runs_by_time_idx ON cron.job_run_details USING btree (start_time DESC)%'
 ) THEN
   RAISE EXCEPTION 'V302 rollback drift: refuse to drop an unknown index';
 END IF;
END
$v302_rb$;
DROP INDEX cron.v302_failed_runs_by_time_idx;
