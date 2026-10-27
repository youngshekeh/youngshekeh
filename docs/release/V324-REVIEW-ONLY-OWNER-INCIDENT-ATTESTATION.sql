-- V324 REVIEW ONLY. Run exclusively in ephemeral PostgreSQL CI.
-- Prereq V323 append-only incident evidence. No payments or cron mutations.
-- Owner review authenticated using live JWT claims and AAL2; a single
-- owner cannot approve their own proposed closure.
BEGIN;
CREATE TABLE public.billing_incident_reviews_v324 (
  review_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_key text NOT NULL
    REFERENCES public.billing_incident_evidence_v323(evidence_key),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (
    action IN (
      'investigate',
      'provider_reconciliation_required',
      'propose_operational_closure',
      'approve_operational_closure'
    )
  ),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  client_action_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id,client_action_id)
);
ALTER TABLE public.billing_incident_reviews_v324 ENABLE ROW LEVEL SECURITY;
-- No direct DML grants or client-visible rows: ALL writes through the gated
-- RPC, which authenticates owner/second factor within the database.
REVOKE ALL ON public.billing_incident_reviews_v324
FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX billing_incident_reviews_v324_evidence_action_idx
ON public.billing_incident_reviews_v324(evidence_key,action,reviewed_at);

CREATE OR REPLACE FUNCTION public.record_billing_incident_review_v324(
  p_evidence_key text,
  p_action text,
  p_evidence_sha256 text,
  p_client_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_existing record;
  v_proposer uuid;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT EXISTS (
      SELECT 1 FROM public.owner_users o
      WHERE o.user_id=v_actor AND o.active IS TRUE AND o.role='owner'
    )
  THEN
    RAISE EXCEPTION 'owner_aal2_required'
      USING ERRCODE='42501';
  END IF;

  IF p_evidence_key IS NULL OR
    p_evidence_key !~ '^[0-9a-f]{32}$' OR
    p_evidence_sha256 IS NULL OR
    p_evidence_sha256 !~ '^[0-9a-f]{64}$' OR
    p_client_action_id IS NULL OR
    p_action IS NULL OR
    p_action NOT IN (
      'investigate',
      'provider_reconciliation_required',
      'propose_operational_closure',
      'approve_operational_closure'
    )
  THEN RAISE EXCEPTION 'invalid_incident_review_input'
       USING ERRCODE='22023'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.billing_incident_evidence_v323
    WHERE evidence_key=p_evidence_key AND triage_status='open'
  ) THEN
    RAISE EXCEPTION 'incident_unavailable' USING ERRCODE='22023';
  END IF;

  -- A submitted idempotency key MUST NOT be reused with altered content.
  SELECT action,evidence_key,evidence_sha256 INTO v_existing
  FROM public.billing_incident_reviews_v324
  WHERE actor_id=v_actor AND client_action_id=p_client_action_id;
  IF FOUND THEN
    IF v_existing.action<>p_action OR
       v_existing.evidence_key<>p_evidence_key OR
       v_existing.evidence_sha256<>p_evidence_sha256
    THEN
      RAISE EXCEPTION 'review_idempotency_conflict'
      USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'status','IDEMPOTENT_REPLAY',
      'commercial_activation_permitted',false,
      'payment_reconciled',false,'incident_closed',false
    );
  END IF;

  -- A second signed-in owner with an independently verified AAL2 session
  -- must approve a matching proposal. Client-supplied reviewer identities
  -- are NEVER accepted. The proposer cannot approve their own evidence.
  IF p_action='approve_operational_closure' THEN
    SELECT actor_id INTO v_proposer
    FROM public.billing_incident_reviews_v324
    WHERE evidence_key=p_evidence_key
      AND action='propose_operational_closure'
      AND evidence_sha256=p_evidence_sha256
      AND actor_id<>v_actor
    ORDER BY reviewed_at DESC LIMIT 1;

    IF v_proposer IS NULL THEN
      RAISE EXCEPTION 'independent_matching_proposal_required'
      USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.billing_incident_reviews_v324 (
    evidence_key,actor_id,action,evidence_sha256,client_action_id)
  VALUES (
    p_evidence_key,v_actor,p_action,p_evidence_sha256,p_client_action_id);

  RETURN jsonb_build_object(
    'ok',true,
    'status',CASE
      WHEN p_action='propose_operational_closure'
        THEN 'AWAITING_INDEPENDENT_AAL2_OWNER_APPROVAL'
      WHEN p_action='approve_operational_closure'
        THEN 'TWO_OWNER_REVIEW_EVIDENCE_RECORDED'
      ELSE 'REVIEW_NOTE_RECORDED' END,
    'commercial_activation_permitted',false,
    'payment_reconciled',false,
    'incident_closed',false,
    'note','Review actions never modify subscriptions, payment events, checkout or source incident evidence'
  );
END
$function$;

-- Read-only private summary. Caller must be an active owner with AAL2,
-- identical to write gate. No PII or provider refs returned.
CREATE OR REPLACE FUNCTION public.billing_incident_review_summary_v324()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid;
  v_open int;
  v_unreviewed int;
  v_awaiting int;
  v_approved int;
BEGIN
  v_actor:=auth.uid();
  IF v_actor IS NULL OR auth.jwt()->>'aal' IS DISTINCT FROM 'aal2'
    OR NOT EXISTS (
      SELECT 1 FROM public.owner_users
      WHERE user_id=v_actor AND active IS TRUE AND role='owner'
    )
  THEN
    RAISE EXCEPTION 'owner_aal2_required' USING ERRCODE='42501';
  END IF;

  WITH cases AS (
    SELECT e.evidence_key,
      EXISTS (
        SELECT 1 FROM public.billing_incident_reviews_v324 r
        WHERE r.evidence_key=e.evidence_key
      ) AS reviewed,
      EXISTS (
        SELECT 1
        FROM public.billing_incident_reviews_v324 proposal
        JOIN public.billing_incident_reviews_v324 approval
          ON proposal.evidence_key=approval.evidence_key
         AND proposal.evidence_sha256=approval.evidence_sha256
         AND proposal.actor_id<>approval.actor_id
        WHERE proposal.evidence_key=e.evidence_key
          AND proposal.action='propose_operational_closure'
          AND approval.action='approve_operational_closure'
      ) AS two_owner_approved,
      EXISTS (
        SELECT 1 FROM public.billing_incident_reviews_v324 r
        WHERE r.evidence_key=e.evidence_key
          AND r.action='propose_operational_closure'
      ) AS proposal_exists
    FROM public.billing_incident_evidence_v323 e
    WHERE e.triage_status='open'
  )
  SELECT count(*)::int,
    count(*) FILTER(WHERE NOT reviewed)::int,
    count(*) FILTER(WHERE proposal_exists AND NOT two_owner_approved)::int,
    count(*) FILTER(WHERE two_owner_approved)::int
  INTO v_open,v_unreviewed,v_awaiting,v_approved
  FROM cases;

  RETURN jsonb_build_object(
    'ok',true,'version','billing_incident_review_v324',
    'open_incidents',v_open,
    'unreviewed',v_unreviewed,
    'awaiting_second_owner_aal2',v_awaiting,
    'dual_review_evidence_present',v_approved,
    'commercial_activation_permitted',false,
    'incident_closed',false,
    'note','Dual review is an audit signal only; incidents remain open until separate verified reconciliation'
  );
END
$function$;

REVOKE ALL ON FUNCTION
  public.record_billing_incident_review_v324(text,text,text,uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.billing_incident_review_summary_v324()
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.record_billing_incident_review_v324(text,text,text,uuid)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_incident_review_summary_v324()
TO authenticated;
COMMIT;
