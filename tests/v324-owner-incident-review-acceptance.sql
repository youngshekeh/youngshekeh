-- V324 isolated PostgreSQL 17. Real signed JWTs / owner MFA still
-- require separate hosted browser acceptance before commercial activation.
\set ON_ERROR_STOP on
INSERT INTO public.billing_incident_evidence_v323
 (evidence_key,evidence_kind,component,occurred_at)
VALUES (repeat('a',32),'stale_agent_run','billing_reconciliation',
 now()-interval '4 hours');

-- Browser role must never perform direct table edits.
DO $$
BEGIN
 IF has_table_privilege('authenticated',
    'public.billing_incident_reviews_v324','SELECT')
 OR has_table_privilege('authenticated',
    'public.billing_incident_reviews_v324','INSERT')
 OR has_table_privilege('anon',
    'public.billing_incident_reviews_v324','SELECT')
 OR has_table_privilege('service_role',
    'public.billing_incident_reviews_v324','INSERT')
 THEN RAISE EXCEPTION 'V324 review table has direct browser/server DML access'; END IF;
 IF has_function_privilege('anon'::regrole,
    'public.record_billing_incident_review_v324(text,text,text,uuid)'::regprocedure,
    'EXECUTE')
 THEN RAISE EXCEPTION 'anon unexpectedly allowed to attest'; END IF;
 IF NOT has_function_privilege('authenticated'::regrole,
    'public.record_billing_incident_review_v324(text,text,text,uuid)'::regprocedure,
    'EXECUTE')
 THEN RAISE EXCEPTION 'authenticated owner unable to use gated RPC'; END IF;
 IF NOT (SELECT relrowsecurity
    FROM pg_catalog.pg_class
    WHERE oid='public.billing_incident_reviews_v324'::regclass)
 THEN RAISE EXCEPTION 'review table RLS is disabled'; END IF;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
SET request.jwt.claims = '{"aal":"aal1"}';
DO $$
DECLARE rejected boolean :=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'investigate',repeat('b',64),
     '20000000-0000-4000-8000-000000000001'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'owner without second factor passed'; END IF;
END $$;

-- A user may claim AAL2 but still isn't an active owner.
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
SET request.jwt.claims = '{"aal":"aal2"}';
DO $$
DECLARE rejected boolean :=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'investigate',repeat('b',64),
     '20000000-0000-4000-8000-000000000002'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'non-owner with AAL2 passed'; END IF;
END $$;

-- The only active owner can record investigation and propose closure.
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
DO $$
DECLARE r jsonb;
BEGIN
 r:=public.record_billing_incident_review_v324(
   repeat('a',32),'investigate',repeat('b',64),
   '20000000-0000-4000-8000-000000000003'::uuid);
 IF r->>'status'<>'REVIEW_NOTE_RECORDED'
   OR r->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'owner investigation review refused or unlocked'; END IF;
 r:=public.record_billing_incident_review_v324(
   repeat('a',32),'propose_operational_closure',repeat('c',64),
   '20000000-0000-4000-8000-000000000004'::uuid);
 IF r->>'status'<>'AWAITING_INDEPENDENT_AAL2_OWNER_APPROVAL'
 THEN RAISE EXCEPTION 'single owner was allowed to close incident'; END IF;
 r:=public.record_billing_incident_review_v324(
   repeat('a',32),'propose_operational_closure',repeat('c',64),
   '20000000-0000-4000-8000-000000000004'::uuid);
 IF r->>'status'<>'IDEMPOTENT_REPLAY'
 THEN RAISE EXCEPTION 'duplicate client action wrote a second review'; END IF;
END $$;

-- Self-approval cannot succeed even with fresh UUID and AAL2.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'approve_operational_closure',repeat('c',64),
     '20000000-0000-4000-8000-000000000005'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'single owner self-approved incident'; END IF;
END $$;

-- A single client_action_id cannot be reused for different evidence.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'investigate',repeat('d',64),
     '20000000-0000-4000-8000-000000000004'::uuid);
 EXCEPTION WHEN unique_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'idempotency UUID content conflict accepted'; END IF;
END $$;

-- The second synthetic user is currently disabled in owner_users.
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'approve_operational_closure',repeat('c',64),
     '20000000-0000-4000-8000-000000000006'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'inactive owner approved incident'; END IF;
END $$;
RESET ROLE;

-- Synthetic-only onboarding of a separate second owner in disposable CI.
UPDATE public.owner_users SET active=true
WHERE user_id='10000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SET request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
SET request.jwt.claims = '{"aal":"aal1"}';
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'approve_operational_closure',repeat('c',64),
     '20000000-0000-4000-8000-000000000007'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'second owner without MFA approved'; END IF;
END $$;
SET request.jwt.claims = '{"aal":"aal2"}';

-- Different evidence digest from the first owner fails.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
   PERFORM public.record_billing_incident_review_v324(
     repeat('a',32),'approve_operational_closure',repeat('e',64),
     '20000000-0000-4000-8000-000000000008'::uuid);
 EXCEPTION WHEN insufficient_privilege THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'mismatching reviewer evidence accepted'; END IF;
END $$;

DO $$
DECLARE r jsonb; report jsonb;
BEGIN
 r:=public.record_billing_incident_review_v324(
   repeat('a',32),'approve_operational_closure',repeat('c',64),
   '20000000-0000-4000-8000-000000000009'::uuid);
 IF r->>'status'<>'TWO_OWNER_REVIEW_EVIDENCE_RECORDED'
   OR r->>'incident_closed'<>'false'
   OR r->>'payment_reconciled'<>'false'
 THEN RAISE EXCEPTION 'dual approval auto-changed incident or payment'; END IF;

 report:=public.billing_incident_review_summary_v324();
 IF (report->>'dual_review_evidence_present')::int<>1
   OR report->>'incident_closed'<>'false'
   OR report->>'commercial_activation_permitted'<>'false'
 THEN RAISE EXCEPTION 'two-owner review not captured safely'; END IF;
END $$;
RESET ROLE;

DO $$
DECLARE report jsonb;
BEGIN
 IF (SELECT count(*) FROM public.billing_incident_reviews_v324)<>3
 THEN RAISE EXCEPTION 'unexpected number of append-only review rows'; END IF;
 IF (SELECT triage_status FROM public.billing_incident_evidence_v323
   WHERE evidence_key=repeat('a',32))<>'open'
 THEN RAISE EXCEPTION 'two-owner attestation closed immutable incident'; END IF;
 IF (SELECT count(*) FROM public.billing_incident_evidence_v323
     WHERE triage_status='open')<1
 THEN RAISE EXCEPTION 'original V323 incident evidence removed'; END IF;
 IF has_function_privilege('service_role'::regrole,
   'public.record_billing_incident_review_v324(text,text,text,uuid)'::regprocedure,
   'EXECUTE')
 THEN RAISE EXCEPTION 'service_role can spoof owner review over Data API'; END IF;
END $$;
SELECT 'V324_TWO_OWNER_AAL2_INCIDENT_ATTESTATION_PG17_PASSED' AS result;
