-- V302: optimize only the recurring V70 failed-cron lookback.
-- Inside Supabase atomic migration, fail quickly rather than blocking pg_cron writers.
SET LOCAL lock_timeout = '1500ms';
SET LOCAL statement_timeout = '15s';
DO $v302_preflight$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='cron' AND c.relname='job_run_details' AND c.relkind='r'
 ) THEN RAISE EXCEPTION 'V302: cron source table drift'; END IF;
 IF EXISTS (
   SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='cron' AND c.relname='v302_failed_runs_by_time_idx'
 ) THEN RAISE EXCEPTION 'V302: index name already present; refuse ambiguous build'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM cron.job
   WHERE jobid=44 AND jobname='tfa-v70-autonomous-core'
     AND command='select public.refresh_autonomous_machine_state();'
     AND active=true AND schedule='11,26,41,56 * * * *'
 ) THEN RAISE EXCEPTION 'V302: core cron migration or command drift'; END IF;
END
$v302_preflight$;

CREATE INDEX v302_failed_runs_by_time_idx
  ON cron.job_run_details USING btree (start_time DESC)
  WHERE status NOT IN ('succeeded','running');

DO $v302_postflight$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_index i
     JOIN pg_class c ON c.oid=i.indexrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='cron' AND c.relname='v302_failed_runs_by_time_idx'
     AND i.indisvalid=true AND i.indisready=true
     AND pg_get_expr(i.indpred,i.indrelid) LIKE '%status <> ALL%'
     AND pg_get_expr(i.indpred,i.indrelid) LIKE '%succeeded%'
     AND pg_get_expr(i.indpred,i.indrelid) LIKE '%running%'
 ) THEN
   RAISE EXCEPTION 'V302: partial index invalid or predicate mismatch';
 END IF;
END
$v302_postflight$;
