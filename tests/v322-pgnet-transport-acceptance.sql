\set ON_ERROR_STOP on
-- The disposable CI runner has no actual pg_net worker. This is evidence
-- of worker absence, NOT an example of a working billable environment.
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.billing_transport_readiness_v322();
 IF x->>'state'<>'WORKER_UNAVAILABLE'
   OR x->>'transport_available'<>'false'
   OR x->>'commercial_activation_permitted'<>'false'
   OR x->>'billing_event_attribution_verified'<>'false'
 THEN RAISE EXCEPTION 'missing pg_net worker should fail closed'; END IF;
END $$;
-- Simulate system-wide HTTP response history without storing any secrets.
INSERT INTO net._http_response(status_code,timed_out,error_msg,created) VALUES
 (200,false,null,now()-interval '15 minutes'),
 (503,false,null,now()-interval '10 minutes'),
 (504,false,null,now()-interval '5 minutes'),
 (null,true,'synthetic-timeout-secret-should-not-be-emitted',now()-interval '3 minutes'),
 (500,false,null,now()-interval '25 hours');

INSERT INTO net.http_request_queue DEFAULT VALUES;
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.billing_transport_readiness_v322();
 IF (x->>'http_5xx_count_1h')::int<>2
    OR (x->>'network_timeout_count_1h')::int<>1
    OR (x->>'response_count_1h')::int<>4
    OR (x->>'queued_request_count')::int<>1
 THEN RAISE EXCEPTION 'incomplete or incorrect transport aggregates: %',x; END IF;
 IF x->>'scope'<>'SYSTEM_WIDE_PG_NET_NOT_BILLING_ONLY'
 THEN RAISE EXCEPTION 'scope implies customer-specific billing evidence'; END IF;
 IF x::text LIKE '%synthetic-timeout-secret%'
    OR x::text LIKE '%http_request_queue.headers%'
    OR x::text LIKE '%payment_reference%'
 THEN RAISE EXCEPTION 'transport leaked hidden network metadata'; END IF;
 IF x->>'transport_available'<>'false'
 THEN RAISE EXCEPTION 'HTTP responses must not mask missing worker'; END IF;
 IF has_function_privilege('anon'::regrole,
   'public.billing_transport_readiness_v322()'::regprocedure,'EXECUTE')
    OR has_function_privilege('authenticated'::regrole,
   'public.billing_transport_readiness_v322()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'browser roles may read private transport RPC'; END IF;
 IF NOT has_function_privilege('service_role'::regrole,
   'public.billing_transport_readiness_v322()'::regprocedure,'EXECUTE')
 THEN RAISE EXCEPTION 'service_role cannot read transport RPC'; END IF;
END $$;

-- Missing response table must never manufacture healthy transport.
DROP TABLE net._http_response;
DO $$
DECLARE x jsonb;
BEGIN
 x:=public.billing_transport_readiness_v322();
 IF x->>'state'<>'TRANSPORT_EVIDENCE_UNAVAILABLE'
    OR x->>'transport_available'<>'false'
    OR x->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'missing pg_net evidence did not fail closed'; END IF;
END $$;
SELECT 'V322_PG_NET_TRANSPORT_DIAGNOSTICS_PG17_PASSED' AS result;
