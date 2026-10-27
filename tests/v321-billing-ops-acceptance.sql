-- V321 billing liveness acceptance: disposable PG17, no production objects.
\set ON_ERROR_STOP on
DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'HOLD'
 THEN RAISE EXCEPTION 'empty scheduler history incorrectly passed'; END IF;
 IF gate->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'commercial unlock slipped through'; END IF;
END $$;

INSERT INTO cron.job(jobid,jobname,schedule,active) VALUES
 (26,'tfa-flutterwave-reconciliation','12 * * * *',true),
 (34,'tfa-billing-subscription-watch','22 */6 * * *',true);
INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
VALUES
 (26,'succeeded',now()-interval '10 minutes',now()-interval '10 minutes','successful schedule'),
 (34,'succeeded',now()-interval '1 hour',now()-interval '1 hour','successful schedule');
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
VALUES
 ('billing_reconciliation','succeeded',now()-interval '10 minutes',now()-interval '9 minutes'),
 ('billing_subscription_watch','succeeded',now()-interval '1 hour',now()-interval '59 minutes');

DO $$
DECLARE gate jsonb; before_count bigint; after_count bigint;
BEGIN
 SELECT count(*) INTO before_count FROM public.agent_runs;
 gate:=public.billing_ops_readiness_v321();
 SELECT count(*) INTO after_count FROM public.agent_runs;
 IF gate->>'ops_gate'<>'PASS'
 THEN RAISE EXCEPTION 'healthy dual-evidence job should pass ops gate'; END IF;
 IF gate->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'operational PASS cannot enable paid checkout'; END IF;
 IF before_count<>after_count
 THEN RAISE EXCEPTION 'read-only billing operation gate mutated agent_runs'; END IF;
END $$;

-- Reproduce the observed production failure shape: 7 reconciliation
-- and 1 subscription-watch runs stuck in "running" beyond two hours.
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
SELECT 'billing_reconciliation','running',now()-interval '3 hours',NULL
FROM generate_series(1,7);
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
VALUES ('billing_subscription_watch','running',now()-interval '3 hours',NULL);

DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'HOLD'
   OR (gate->'reconciliation'->>'stale_running')::int<>7
   OR (gate->'subscription_watch'->>'stale_running')::int<>1
 THEN RAISE EXCEPTION 'stale eight-run condition must block readiness'; END IF;
END $$;

-- Only synthetic fixture records are changed here, NEVER the production rows.
UPDATE public.agent_runs
SET status='failed', completed_at=now()
WHERE status='running';

-- Reproduce the observed 35+5 scheduler timeouts within the last 24h.
INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
SELECT 26,'failed',now()-interval '2 hours',now()-interval '119 minutes',
       'upstream request timeout'
FROM generate_series(1,35);
INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
SELECT 34,'failed',now()-interval '2 hours',now()-interval '119 minutes',
       'upstream request timeout'
FROM generate_series(1,5);

DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'HOLD'
   OR (gate->'reconciliation'->>'cron_failed_24h')::int<>35
   OR (gate->'subscription_watch'->>'cron_failed_24h')::int<>5
   OR (gate->'reconciliation'->>'cron_timeouts_24h')::int<>35
   OR (gate->'subscription_watch'->>'cron_timeouts_24h')::int<>5
 THEN RAISE EXCEPTION '40 timeout history should block billing release'; END IF;
END $$;

-- Old 24h failures cease to count, with fresh successful cron+agent
-- evidence. This intentionally asserts both data sources, not cron alone.
UPDATE cron.job_run_details
SET start_time=now()-interval '25 hours'
WHERE status='failed';

DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'PASS'
 THEN RAISE EXCEPTION 'expired scheduler timeouts should not block healthy recent evidence'; END IF;
END $$;

-- Cron success but no fresh completed agent run is NOT a pass.
UPDATE public.agent_runs
SET completed_at=now()-interval '9 hours'
WHERE agent_type='billing_subscription_watch' AND status='succeeded';

DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'HOLD'
 THEN RAISE EXCEPTION 'cron-only success was trusted without agent completion'; END IF;
END $$;
UPDATE public.agent_runs SET completed_at=now()-interval '59 minutes'
WHERE agent_type='billing_subscription_watch' AND status='succeeded';

-- Cron job disabled holds, even when all historic snapshots look good.
UPDATE cron.job SET active=false WHERE jobid=26;
DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'HOLD'
 THEN RAISE EXCEPTION 'disabled billing cron was accepted'; END IF;
END $$;
UPDATE cron.job SET active=true WHERE jobid=26;

DO $$
DECLARE gate jsonb;
BEGIN
 gate:=public.billing_ops_readiness_v321();
 IF gate->>'ops_gate'<>'PASS'
 THEN RAISE EXCEPTION 'recovered synthetic billing liveness did not pass'; END IF;
 IF has_function_privilege(
    'anon'::regrole,
    'public.billing_ops_readiness_v321()'::regprocedure,'EXECUTE'
  ) OR has_function_privilege(
    'authenticated'::regrole,
    'public.billing_ops_readiness_v321()'::regprocedure,'EXECUTE'
  ) THEN RAISE EXCEPTION 'browser roles can call private billing evidence RPC'; END IF;
 IF NOT has_function_privilege(
    'service_role'::regrole,
    'public.billing_ops_readiness_v321()'::regprocedure,'EXECUTE'
  ) THEN RAISE EXCEPTION 'service role cannot read operational evidence RPC'; END IF;
END $$;

SELECT 'V321_BILLING_OPS_LIVENESS_PG17_ACCEPTANCE_PASSED' AS result;
