-- V322 REVIEW ONLY. Not approved for production migration.
-- Transport observability for billing release. This CANNOT correlate a
-- system-wide pg_net response to a particular billing cron invocation.
-- Service role only. No raw URLs/headers/content/error messages/request IDs.
BEGIN;
CREATE OR REPLACE FUNCTION public.billing_transport_readiness_v322()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, net
AS $f$
DECLARE
  worker_count int := 0;
  queued int := 0;
  recent_total int := 0;
  recent_5xx int := 0;
  recent_4xx int := 0;
  recent_transport_errors int := 0;
  recent_timeouts int := 0;
  latest_sample timestamptz;
  earliest_sample timestamptz;
  state text;
BEGIN
  SELECT count(*)::int INTO worker_count FROM pg_catalog.pg_stat_activity
    WHERE backend_type ILIKE '%pg_net%';
  SELECT count(*)::int INTO queued FROM net.http_request_queue;
  SELECT count(*)::int,
         count(*) FILTER(WHERE status_code BETWEEN 500 AND 599)::int,
         count(*) FILTER(WHERE status_code BETWEEN 400 AND 499)::int,
         count(*) FILTER(WHERE error_msg IS NOT NULL)::int,
         count(*) FILTER(WHERE timed_out IS TRUE)::int,
         min(created),max(created)
    INTO recent_total,recent_5xx,recent_4xx,recent_transport_errors,
         recent_timeouts,earliest_sample,latest_sample
    FROM net._http_response WHERE created >= now()-interval '1 hour';

  -- Report only positive transport evidence, not payment acceptance.
  -- Other products share pg_net. 5xx counts alone DO NOT prove
  -- this payment processor failed and cannot be used to identify users.
  state:=CASE
    WHEN worker_count<1 THEN 'WORKER_UNAVAILABLE'
    WHEN queued>100 THEN 'QUEUE_PRESSURE'
    WHEN recent_total=0 THEN 'NO_RECENT_TRANSPORT_EVIDENCE'
    WHEN recent_timeouts>0 OR recent_transport_errors>0 OR recent_5xx>0
      THEN 'GLOBAL_TRANSPORT_ERRORS_OBSERVED'
    ELSE 'TRANSPORT_OBSERVABLE'
  END;

  RETURN jsonb_build_object(
    'ok',true,
    'version','billing_transport_readiness_v322',
    'state',state,
    'transport_available',worker_count>0 AND queued<=100,
    'billing_event_attribution_verified',false,
    'commercial_activation_permitted',false,
    'scope','SYSTEM_WIDE_PG_NET_NOT_BILLING_ONLY',
    'window','1h_retained_pg_net_evidence_only',
    'worker_count',worker_count,
    'queued_request_count',queued,
    'response_count_1h',recent_total,
    'http_5xx_count_1h',recent_5xx,
    'http_4xx_count_1h',recent_4xx,
    'network_error_count_1h',recent_transport_errors,
    'network_timeout_count_1h',recent_timeouts,
    'first_response_at_1h',earliest_sample,
    'last_response_at_1h',latest_sample,
    'note','pg_net HTTP responses are global, retention-limited and not attributed to billing; cron and completed-agent-run evidence required independently'
  );
EXCEPTION WHEN OTHERS THEN
  -- Missing pg_net / permission / timeout: fail closed rather than
  -- manufacture a healthy report. No raw exception strings are exposed.
  RETURN jsonb_build_object(
    'ok',false,'version','billing_transport_readiness_v322',
    'state','TRANSPORT_EVIDENCE_UNAVAILABLE',
    'transport_available',false,
    'billing_event_attribution_verified',false,
    'commercial_activation_permitted',false
  );
END
$f$;
REVOKE ALL ON FUNCTION public.billing_transport_readiness_v322()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_transport_readiness_v322()
  TO service_role;
COMMIT;
