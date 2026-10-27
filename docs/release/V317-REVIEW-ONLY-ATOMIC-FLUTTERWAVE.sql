-- V317 REVIEW ONLY. DO NOT apply to production without staging replay,
-- current backup inventory, isolated restoration rehearsal and merchant approval.
-- Migrates the paid Flutterwave processing path to an atomic RPC.
--
-- Caller MUST independently authenticate provider webhook signature, fetch
-- Flutterwave transaction verification over server-to-server TLS and match
-- provider success/status, amount, currency, customer and tx_ref BEFORE call.
-- This function cannot itself prove payment or charge a card.
--
-- Crucial: event ledger INSERT, checkout intent UPDATE and subscription term
-- extension happen in ONE PostgreSQL transaction. No partial-commit path.
--
-- Existing legacy events without the v317_atomic_commit marker are held for
-- MANUAL reconciliation: never infer whether their entitlement was applied.

BEGIN;

CREATE OR REPLACE FUNCTION public.commit_verified_flutterwave_payment_v317(
  p_transaction_id text,
  p_user_id uuid,
  p_plan_id text,
  p_amount numeric,
  p_currency text,
  p_tx_ref text,
  p_checkout_id uuid DEFAULT NULL,
  p_customer_id text DEFAULT NULL,
  p_subscription_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_map public.billing_plan_mappings%ROWTYPE;
  v_checkout public.checkout_intents%ROWTYPE;
  v_subscription public.subscriptions%ROWTYPE;
  v_existing public.payment_events%ROWTYPE;
  v_new_event_id uuid;
  v_baseline timestamptz;
  v_end timestamptz;
  v_transaction_id text;
BEGIN
  v_transaction_id := btrim(p_transaction_id);
  IF p_transaction_id IS NULL OR length(v_transaction_id) < 1
    OR length(v_transaction_id) > 128 OR p_user_id IS NULL
    OR p_plan_id IS NULL OR p_currency IS NULL OR p_amount IS NULL
    OR p_amount <= 0 OR p_amount::text = 'NaN' THEN
    RAISE EXCEPTION 'v317_invalid_verified_payment';
  END IF;
  IF p_currency <> 'USD' OR p_plan_id = 'free' THEN
    RAISE EXCEPTION 'v317_unaccepted_payment_currency_or_plan';
  END IF;

  -- Serialize distinct renewals for the same user even with no existing row.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 317));

  SELECT * INTO v_existing FROM public.payment_events
  WHERE provider = 'flutterwave'
    AND raw_payload->>'transaction_id' = v_transaction_id LIMIT 1;
  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM p_user_id
      OR v_existing.plan_id IS DISTINCT FROM p_plan_id
      OR COALESCE(v_existing.raw_payload->>'v317_atomic_commit','false') <> 'true' THEN
      RAISE EXCEPTION 'v317_previous_receipt_requires_manual_reconciliation';
    END IF;
    RETURN jsonb_build_object('ok',true,'state','ALREADY_COMMITTED');
  END IF;

  SELECT * INTO v_plan FROM public.plans
  WHERE id = p_plan_id AND is_active = true LIMIT 1;
  SELECT * INTO v_map FROM public.billing_plan_mappings
  WHERE provider = 'flutterwave' AND plan_id = p_plan_id
    AND is_active = true AND recurring = true LIMIT 1;

  IF v_plan.id IS NULL OR v_map.plan_id IS NULL
    OR p_amount IS DISTINCT FROM v_plan.price_monthly_usd
    OR v_map.currency IS DISTINCT FROM p_currency
    OR v_plan.price_monthly_usd <= 0 THEN
    RAISE EXCEPTION 'v317_provider_plan_parity_failed';
  END IF;

  IF p_checkout_id IS NOT NULL THEN
    SELECT * INTO v_checkout FROM public.checkout_intents
    WHERE id = p_checkout_id AND provider = 'flutterwave'
      AND user_id = p_user_id AND plan_id = p_plan_id
    FOR UPDATE;
    IF v_checkout.id IS NULL
      OR v_checkout.provider_reference IS DISTINCT FROM p_tx_ref
      OR v_checkout.status <> 'pending'
      OR v_checkout.currency IS DISTINCT FROM p_currency
      OR v_checkout.amount IS DISTINCT FROM p_amount THEN
      RAISE EXCEPTION 'v317_checkout_intent_evidence_missing';
    END IF;
  ELSE
    -- Recurring payments can only renew an existing matching paid
    -- provider customer/subscription. Never grant access based on email.
    SELECT * INTO v_subscription FROM public.subscriptions
    WHERE user_id = p_user_id AND provider = 'flutterwave'
      AND plan_id = p_plan_id AND status IN ('active','trialing','canceled')
    FOR UPDATE;
    IF v_subscription.id IS NULL
      OR NOT (
        (p_customer_id IS NOT NULL
          AND v_subscription.provider_customer_id = p_customer_id)
        OR
        (p_subscription_id IS NOT NULL
          AND v_subscription.provider_subscription_id = p_subscription_id)
      ) THEN
      RAISE EXCEPTION 'v317_recurring_member_binding_unverified';
    END IF;
  END IF;

  -- Must come before the term extension, *inside the same transaction*.
  INSERT INTO public.payment_events
    (provider,provider_event_key,event_type,user_id,plan_id,
     amount,currency,status,raw_payload)
  VALUES
    ('flutterwave','txn:' || v_transaction_id,
     CASE WHEN p_checkout_id IS NULL THEN 'charge.recurring'
          ELSE 'charge.completed' END,
     p_user_id,p_plan_id,p_amount,p_currency,'successful',
     pg_catalog.jsonb_build_object(
       'transaction_id',v_transaction_id,
       'v317_atomic_commit',true,'v317_receipt_version','v317',
       'checkout_intent_id',p_checkout_id))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_event_id;

  IF v_new_event_id IS NULL THEN
    RAISE EXCEPTION 'v317_payment_receipt_conflict_hold';
  END IF;

  IF p_checkout_id IS NOT NULL THEN
    UPDATE public.checkout_intents
    SET status='paid', updated_at=now()
    WHERE id=p_checkout_id;
  END IF;

  IF v_subscription.id IS NULL THEN
    SELECT * INTO v_subscription FROM public.subscriptions
    WHERE user_id=p_user_id FOR UPDATE;
  END IF;
  v_baseline := greatest(coalesce(v_subscription.current_period_end, now()),now());
  v_end := v_baseline + interval '1 month';

  INSERT INTO public.subscriptions
    (user_id,plan_id,status,provider,provider_customer_id,
     provider_subscription_id,current_period_end)
  VALUES
    (p_user_id,p_plan_id,'active','flutterwave',
     p_customer_id,p_subscription_id,v_end)
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    provider = EXCLUDED.provider,
    provider_customer_id = COALESCE(
      EXCLUDED.provider_customer_id,public.subscriptions.provider_customer_id),
    provider_subscription_id = COALESCE(
      EXCLUDED.provider_subscription_id,public.subscriptions.provider_subscription_id),
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  RETURN jsonb_build_object(
    'ok',true,'state','COMMITTED','period_end',v_end);
END
$function$;

-- SECURITY DEFINER: explicitly revoke implicit PUBLIC EXECUTE and deny
-- browser roles, leaving only the server's service_role credential.
REVOKE ALL ON FUNCTION public.commit_verified_flutterwave_payment_v317(
  text,uuid,text,numeric,text,text,uuid,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_verified_flutterwave_payment_v317(
  text,uuid,text,numeric,text,text,uuid,text,text
) TO service_role;

COMMIT;
