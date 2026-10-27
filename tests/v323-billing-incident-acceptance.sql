-- V323 disposable PostgreSQL 17 test only. NEVER execute on production.
\set ON_ERROR_STOP on
-- Reset only synthetic job/agent fixture data from earlier V321 acceptance.
TRUNCATE TABLE public.agent_runs;
TRUNCATE TABLE cron.job_run_details;

DO $$
DECLARE x jsonb;
BEGIN
 x:=public.billing_incident_readiness_v323();
 IF x->>'gate'<>'NO_RECORDED_INCIDENTS'
    OR x->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'empty review evidence must never enable payments'; END IF;
END $$;

-- Existing configured two cron jobs came from the disposable V321 fixture.
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
SELECT 'billing_reconciliation','running',now()-interval '3 hours',NULL
FROM generate_series(1,7);
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
VALUES ('billing_subscription_watch','running',now()-interval '3 hours',NULL);

INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
SELECT 26,'failed',now()-interval '2 hours',now()-interval '118 minutes',
  'synthetic upstream timeout, NO token or user data'
FROM generate_series(1,35);
INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
SELECT 34,'failed',now()-interval '1 hour',now()-interval '59 minutes',
  'synthetic cancellation timeout, NO token or user data'
FROM generate_series(1,5);
-- Different failure categories and unrelated cron jobs MUST NOT be inserted.
INSERT INTO cron.job_run_details(jobid,status,start_time,end_time,return_message)
VALUES (26,'failed',now()-interval '20 minutes',now()-interval '19 minutes',
   'synthetic permission denied, no timeout term');

DO $$
DECLARE
  run_before integer; cron_before integer;
  run_after integer; cron_after integer;
  x jsonb;
BEGIN
 SELECT count(*) INTO run_before FROM public.agent_runs;
 SELECT count(*) INTO cron_before FROM cron.job_run_details;
 x:=public.capture_billing_incidents_v323();
 SELECT count(*) INTO run_after FROM public.agent_runs;
 SELECT count(*) INTO cron_after FROM cron.job_run_details;
 IF x->>'status'<>'EVIDENCE_PRESERVED_REVIEW_REQUIRED'
   OR (x->>'captured_new_count')::int<>48
   OR (x->>'candidate_count')::int<>48
   OR x->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION '48 synthetic billing incidents not preserved: %',x; END IF;
 IF run_after<>run_before OR cron_after<>cron_before
 THEN RAISE EXCEPTION 'source run/cron records were modified'; END IF;
 IF (SELECT count(*) FROM public.billing_incident_evidence_v323)<>48
 THEN RAISE EXCEPTION 'incident evidence ledger missed rows'; END IF;
 IF (SELECT count(*) FROM public.billing_incident_evidence_v323
   WHERE evidence_key !~ '^[0-9a-f]{32}$'
      OR triage_status<>'open')>0
 THEN RAISE EXCEPTION 'invalid hashed keys or open-only status'; END IF;
END $$;

-- The exact same scheduler replay and old running records must be idempotent.
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.capture_billing_incidents_v323();
 IF (x->>'captured_new_count')::int<>0
    OR (x->>'candidate_count')::int<>48
 THEN RAISE EXCEPTION 'repeat snapshot inserted duplicates: %',x; END IF;
END $$;

-- One newly found stale agent run should append exactly one event.
INSERT INTO public.agent_runs(agent_type,status,started_at,completed_at)
VALUES ('billing_reconciliation','running',now()-interval '5 hours',NULL);
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.capture_billing_incidents_v323();
 IF (x->>'captured_new_count')::int<>1
 THEN RAISE EXCEPTION 'new orphan run should be appended exactly once'; END IF;
END $$;

-- Resolving the *synthetic source* incident does not erase audit evidence.
UPDATE public.agent_runs
SET status='succeeded',completed_at=now()
WHERE status='running';
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.billing_incident_readiness_v323();
 IF x->>'gate'<>'HOLD'
    OR (x->>'open_incident_count')::int<>49
    OR (x->>'stale_agent_run_count')::int<>0
 THEN RAISE EXCEPTION 'append-only incidents erased or closed when source changed: %',x; END IF;
END $$;

-- RLS + privilege: browser roles cannot list/insert incident evidence or call RPC.
DO $$
DECLARE
  x jsonb;
BEGIN
 IF has_table_privilege('anon','public.billing_incident_evidence_v323','SELECT')
    OR has_table_privilege('authenticated','public.billing_incident_evidence_v323','SELECT')
    OR has_table_privilege('anon','public.billing_incident_evidence_v323','INSERT')
    OR has_table_privilege('authenticated','public.billing_incident_evidence_v323','INSERT')
 THEN RAISE EXCEPTION 'public role can read/write incident queue'; END IF;
 IF has_function_privilege('anon'::regrole,
   'public.capture_billing_incidents_v323()'::regprocedure,'EXECUTE')
    OR has_function_privilege('authenticated'::regrole,
   'public.billing_incident_readiness_v323()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'public role can invoke incident capture/readiness'; END IF;
 IF NOT has_function_privilege('service_role'::regrole,
   'public.capture_billing_incidents_v323()'::regprocedure,'EXECUTE')
    OR NOT has_function_privilege('service_role'::regrole,
   'public.billing_incident_readiness_v323()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'private service role cannot access incident functions'; END IF;
 IF (SELECT relrowsecurity FROM pg_class
    WHERE oid='public.billing_incident_evidence_v323'::regclass) IS NOT TRUE
 THEN RAISE EXCEPTION 'incident ledger RLS disabled'; END IF;
 x:=public.capture_billing_incidents_v323();
 IF (x->>'captured_new_count')::int<>0
 THEN RAISE EXCEPTION 'repeated replay should be idempotent'; END IF;
END $$;
SELECT 'V323_BILLING_INCIDENT_APPEND_ONLY_PG17_PASSED' AS result;
