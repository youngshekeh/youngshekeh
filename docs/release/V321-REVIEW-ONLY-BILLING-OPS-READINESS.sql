-- V321 REVIEW ONLY. DO NOT run against production without backed-up staging,
-- an isolated restore rehearsal, owner approval and a controlled release.
--
-- Service-role-only, read-only database liveness snapshot for Flutterwave
-- reconciliation and subscription monitoring. NEVER modifies agent_runs,
-- checkout_intents, subscriptions, payment_events or cron jobs.
-- Historical timeouts are not payment failures; incomplete runs are not
-- evidence of a successful payment.
BEGIN;
CREATE OR REPLACE FUNCTION public.billing_ops_readiness_v321()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, cron
AS $function$
DECLARE
  v_reconciliation_stale int;
  v_subscription_stale int;
  v_reconciliation_timeout int;
  v_subscription_timeout int;
  v_reconciliation_cron_failed int;
  v_subscription_cron_failed int;
  v_latest_reconciliation timestamptz;
  v_latest_subscription timestamptz;
  v_enabled_reconciliation boolean;
  v_enabled_subscription boolean;
  v_ops_pass boolean;
BEGIN
  SELECT count(*)::int INTO v_reconciliation_stale
  FROM public.agent_runs
  WHERE agent_type = 'billing_reconciliation' AND status = 'running'
    AND (started_at IS NULL OR started_at < now()-interval '15 minutes');

  SELECT count(*)::int INTO v_subscription_stale
  FROM public.agent_runs
  WHERE agent_type = 'billing_subscription_watch' AND status = 'running'
    AND (started_at IS NULL OR started_at < now()-interval '15 minutes');

  SELECT coalesce(bool_or(active),false) INTO v_enabled_reconciliation
  FROM cron.job WHERE jobname='tfa-flutterwave-reconciliation';

  SELECT coalesce(bool_or(active),false) INTO v_enabled_subscription
  FROM cron.job WHERE jobname='tfa-billing-subscription-watch';

  SELECT
    count(*) FILTER(WHERE d.status='failed')::int,
    count(*) FILTER(
      WHERE d.status='failed'
      AND d.return_message ILIKE '%timeout%')::int,
    max(d.start_time) FILTER(WHERE d.status='succeeded')
  INTO
    v_reconciliation_cron_failed,
    v_reconciliation_timeout,
    v_latest_reconciliation
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
  WHERE j.jobname='tfa-flutterwave-reconciliation'
    AND d.start_time > now()-interval '24 hours';

  SELECT
    count(*) FILTER(WHERE d.status='failed')::int,
    count(*) FILTER(
      WHERE d.status='failed'
      AND d.return_message ILIKE '%timeout%')::int,
    max(d.start_time) FILTER(WHERE d.status='succeeded')
  INTO
    v_subscription_cron_failed,
    v_subscription_timeout,
    v_latest_subscription
  FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
  WHERE j.jobname='tfa-billing-subscription-watch'
    AND d.start_time > now()-interval '24 hours';

  -- Cron's "succeeded" often means the cron SQL command ran. It does not
  -- verify success of an asynchronous HTTP edge-function execution.
  -- Require BOTH a fresh successful scheduler execution and a fresh
  -- *completed* agent-run report before considering operational liveness.
  v_ops_pass :=
    v_enabled_reconciliation AND v_enabled_subscription
    AND v_reconciliation_stale=0 AND v_subscription_stale=0
    AND v_reconciliation_cron_failed=0 AND v_subscription_cron_failed=0
    AND v_latest_reconciliation > now()-interval '90 minutes'
    AND v_latest_subscription > now()-interval '7 hours'
    AND EXISTS (
      SELECT 1 FROM public.agent_runs
      WHERE agent_type='billing_reconciliation' AND status='succeeded'
        AND completed_at IS NOT NULL
        AND completed_at > now()-interval '90 minutes')
    AND EXISTS (
      SELECT 1 FROM public.agent_runs
      WHERE agent_type='billing_subscription_watch' AND status='succeeded'
        AND completed_at IS NOT NULL
        AND completed_at > now()-interval '7 hours'
    );

  RETURN jsonb_build_object(
    'ok',true,
    'version','billing_ops_readiness_v321',
    'ops_gate',CASE WHEN v_ops_pass THEN 'PASS' ELSE 'HOLD' END,
    'commercial_activation_permitted',false,
    'recent_window','24h',
    'max_running_age_minutes',15,
    'reconciliation',jsonb_build_object(
      'cron_active',v_enabled_reconciliation,
      'stale_running',v_reconciliation_stale,
      'cron_failed_24h',v_reconciliation_cron_failed,
      'cron_timeouts_24h',v_reconciliation_timeout,
      'last_cron_succeeded_at',v_latest_reconciliation
    ),
    'subscription_watch',jsonb_build_object(
      'cron_active',v_enabled_subscription,
      'stale_running',v_subscription_stale,
      'cron_failed_24h',v_subscription_cron_failed,
      'cron_timeouts_24h',v_subscription_timeout,
      'last_cron_succeeded_at',v_latest_subscription
    ),
    'note','Cron success and agent completion are independent evidence; no entitlements are modified.'
  );
END
$function$;

REVOKE ALL ON FUNCTION public.billing_ops_readiness_v321()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_ops_readiness_v321()
TO service_role;
COMMIT;
