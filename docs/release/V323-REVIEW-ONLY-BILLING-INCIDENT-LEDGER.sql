-- V323 REVIEW ONLY. Apply ONLY on a disposable, isolated PG17 test DB
-- until production backup inventory, restore rehearsal and human approval.
-- This is an append-only evidence ledger, NOT a payment reconciliation engine.
-- It must not update agent_runs, cron, checkout, payment, subscriptions or MFA.
BEGIN;
CREATE TABLE IF NOT EXISTS public.billing_incident_evidence_v323 (
  evidence_key text PRIMARY KEY
    CHECK (evidence_key ~ '^[0-9a-f]{32}$'),
  evidence_kind text NOT NULL
    CHECK (evidence_kind IN ('stale_agent_run','cron_timeout')),
  component text NOT NULL
    CHECK (component IN ('billing_reconciliation','billing_subscription_watch')),
  occurred_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  triage_status text NOT NULL DEFAULT 'open' CHECK(triage_status='open')
);
ALTER TABLE public.billing_incident_evidence_v323 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_incident_evidence_v323
  FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT ON TABLE public.billing_incident_evidence_v323
  TO service_role;

CREATE OR REPLACE FUNCTION public.capture_billing_incidents_v323()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $body$
DECLARE
  v_candidate_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  -- Only existing billing agent and scheduler metadata is inspected.
  -- No IDs, addresses, tokens, headers, URLs, messages, payment references,
  -- provider payloads or PII are copied into the incident evidence table.
  -- Evidence keys are deterministic, irreversible-to-the-client md5 tags
  -- scoped to one source type; raw source IDs never leave this routine.
  WITH candidates AS (
    SELECT
      pg_catalog.md5('v323:agent:'||a.id::text) AS evidence_key,
      'stale_agent_run'::text AS evidence_kind,
      a.agent_type::text AS component,
      coalesce(a.started_at,now()) AS occurred_at
    FROM public.agent_runs a
    WHERE a.agent_type IN (
      'billing_reconciliation','billing_subscription_watch')
      AND a.status='running'
      AND (a.started_at IS NULL OR a.started_at<now()-interval '15 minutes')

    UNION ALL

    SELECT
      pg_catalog.md5('v323:cron:'||d.runid::text) AS evidence_key,
      'cron_timeout'::text AS evidence_kind,
      CASE WHEN j.jobname='tfa-flutterwave-reconciliation'
        THEN 'billing_reconciliation'
        ELSE 'billing_subscription_watch' END AS component,
      d.start_time AS occurred_at
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid=d.jobid
    WHERE j.jobname IN (
      'tfa-flutterwave-reconciliation',
      'tfa-billing-subscription-watch')
      AND d.status='failed'
      AND d.start_time >= now()-interval '72 hours'
      AND d.start_time IS NOT NULL
      AND d.return_message ILIKE '%timeout%'
  ),
  ranked AS (
    SELECT c.*,
      row_number() OVER (ORDER BY c.occurred_at DESC,c.evidence_key) AS rn
    FROM candidates c
  ),
  captured AS (
    INSERT INTO public.billing_incident_evidence_v323
      (evidence_key,evidence_kind,component,occurred_at)
    SELECT evidence_key,evidence_kind,component,occurred_at
    FROM ranked WHERE rn<=200
    ON CONFLICT (evidence_key) DO NOTHING
    RETURNING evidence_key
  )
  SELECT
    (SELECT count(*)::int FROM ranked),
    (SELECT count(*)::int FROM captured)
  INTO v_candidate_count,v_inserted_count;

  RETURN jsonb_build_object(
    'ok',true,'version','billing_incident_capture_v323',
    'captured_new_count',v_inserted_count,
    'candidate_count',v_candidate_count,
    'scan_truncated',v_candidate_count>200,
    'status',CASE WHEN v_candidate_count>200
      THEN 'PARTIAL_EVIDENCE_REVIEW_REQUIRED'
      WHEN v_candidate_count>0 THEN 'EVIDENCE_PRESERVED_REVIEW_REQUIRED'
      ELSE 'NO_CURRENT_INCIDENT_CANDIDATES' END,
    'customer_entitlement_changed',false,
    'cron_job_modified',false,
    'payment_reconciled',false,
    'commercial_activation_permitted',false
  );
END
$body$;

CREATE OR REPLACE FUNCTION public.billing_incident_readiness_v323()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $body$
DECLARE
  v_open_count integer;
  v_stale_count integer;
BEGIN
  SELECT count(*)::int INTO v_open_count
    FROM public.billing_incident_evidence_v323
    WHERE triage_status='open';
  SELECT count(*)::int INTO v_stale_count
    FROM public.agent_runs
    WHERE agent_type IN (
      'billing_reconciliation','billing_subscription_watch')
      AND status='running'
      AND (started_at IS NULL OR started_at<now()-interval '15 minutes');
  RETURN jsonb_build_object(
    'ok',true,'version','billing_incident_readiness_v323',
    'gate',CASE WHEN v_open_count>0 OR v_stale_count>0
      THEN 'HOLD' ELSE 'NO_RECORDED_INCIDENTS' END,
    'open_incident_count',v_open_count,
    'stale_agent_run_count',v_stale_count,
    'commercial_activation_permitted',false,
    'no_auto_closure',true,
    'note','Evidence presence is not proof of payment failure; zero incidents is not permission to activate checkout.'
  );
END
$body$;

REVOKE ALL ON FUNCTION public.capture_billing_incidents_v323()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_billing_incidents_v323()
  TO service_role;
REVOKE ALL ON FUNCTION public.billing_incident_readiness_v323()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_incident_readiness_v323()
  TO service_role;
COMMIT;
