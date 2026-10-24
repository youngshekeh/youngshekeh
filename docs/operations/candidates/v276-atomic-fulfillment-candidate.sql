-- V276 HARDENED CANDIDATE ONLY, NOT AN AUTO MIGRATION. NEVER APPLY WITHOUT SANDBOX, RESTORE AND OPERATOR REVIEW.
-- Hardens V275 missing-row concurrent subscription UPSERT race with conflict-time predicate.
-- This function is not invoked by any live application or webhook.
BEGIN;
CREATE OR REPLACE FUNCTION public.fulfill_verified_flutterwave_checkout_v276(
 p_tx_id text, p_event_key text, p_checkout_reference text, p_user_id uuid,
 p_plan_id text, p_amount numeric, p_currency text, p_provider_status text,
 p_verified_at timestamptz, p_period_end timestamptz,
 p_customer_id text DEFAULT NULL, p_subscription_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $v276$
DECLARE
 v_checkout public.checkout_intents%ROWTYPE;
 v_event public.payment_events%ROWTYPE;
 v_member public.subscriptions%ROWTYPE;
 v_member_id uuid;
 v_rows integer;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 -- The authorized webhook must verify the HMAC and actual Flutterwave
 -- transaction and billing period before invoking this service-role RPC.
 IF p_user_id IS NULL OR p_plan_id IS NULL
  OR p_plan_id NOT IN ('pro','executive','business','enterprise')
  OR p_tx_id IS NULL OR length(p_tx_id) NOT BETWEEN 1 AND 128
  OR p_tx_id !~ '^[A-Za-z0-9_-]+$'
  OR p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 128
  OR p_checkout_reference IS NULL
  OR length(p_checkout_reference) NOT BETWEEN 1 AND 160
  OR p_amount IS NULL OR p_amount<=0
  OR p_currency IS DISTINCT FROM 'USD'
  OR p_provider_status IS DISTINCT FROM 'successful'
  OR p_verified_at IS NULL
  OR p_verified_at NOT BETWEEN now()-interval '10 minutes' AND now()+interval '60 seconds'
  OR p_period_end IS NULL OR p_period_end<=now()
  OR p_period_end>now()+interval '65 days'
 THEN RAISE EXCEPTION 'V276_VERIFIED_PROVIDER_RECEIPT_REQUIRED'; END IF;

 -- Lock this unique provider reference for this SQL transaction only.
 SELECT * INTO v_checkout FROM public.checkout_intents
 WHERE provider='flutterwave' AND provider_reference=p_checkout_reference
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'V276_CHECKOUT_REFERENCE_NOT_FOUND'; END IF;
 IF v_checkout.user_id IS DISTINCT FROM p_user_id
  OR v_checkout.plan_id IS DISTINCT FROM p_plan_id
  OR v_checkout.amount IS DISTINCT FROM p_amount
  OR v_checkout.currency IS DISTINCT FROM p_currency
 THEN RAISE EXCEPTION 'V276_CHECKOUT_IDENTITY_OR_AMOUNT_MISMATCH'; END IF;

 IF NOT EXISTS (
  SELECT 1 FROM public.plans p
  JOIN public.billing_plan_mappings m ON m.plan_id=p.id
  WHERE p.id=p_plan_id AND p.is_active=true AND m.is_active=true
  AND m.provider='flutterwave' AND m.recurring=true AND m.currency='USD'
  AND m.provider_plan_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'V276_PLAN_MAPPING_NOT_VERIFIED'; END IF;

 SELECT * INTO v_member FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;
 -- A new webhook event key must not already designate a different transaction.
 IF EXISTS(SELECT 1 FROM public.payment_events e WHERE e.provider='flutterwave'
     AND e.provider_event_key=p_event_key
     AND e.raw_payload->>'transaction_id' IS DISTINCT FROM p_tx_id)
 THEN RAISE EXCEPTION 'V276_EVENT_KEY_REUSED_FOR_DIFFERENT_TRANSACTION'; END IF;
 SELECT * INTO v_event FROM public.payment_events
 WHERE provider='flutterwave'
  AND (provider_event_key=p_event_key OR raw_payload->>'transaction_id'=p_tx_id)
 LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  -- The marker and entitlement are written in the SAME transaction below.
  -- An old/partial event has no marker and NEVER restores paid access.
  IF v_event.raw_payload->>'fulfillment_state'='committed_v276'
   AND v_event.raw_payload->>'transaction_id'=p_tx_id
   AND v_event.raw_payload->>'checkout_reference'=p_checkout_reference
   AND v_event.user_id=p_user_id AND v_event.plan_id=p_plan_id
   AND v_checkout.status='paid'
   AND v_member.user_id=p_user_id AND v_member.plan_id=p_plan_id
   AND v_member.provider='flutterwave'
   AND v_member.current_period_end IS NOT NULL
   AND v_member.current_period_end>=p_period_end
   AND v_event.amount IS NOT DISTINCT FROM p_amount
   AND v_event.currency IS NOT DISTINCT FROM 'USD'
   AND (v_event.raw_payload->>'paid_period_end')::timestamptz IS NOT DISTINCT FROM p_period_end
  THEN
   RETURN jsonb_build_object('state','ALREADY_COMMITTED_NOOP',
    'duplicate',true,'entitlement_extended',false,'new_charge',false);
  END IF;
  RAISE EXCEPTION 'V276_LEGACY_OR_PARTIAL_EVENT_REQUIRES_RECONCILIATION';
 END IF;
 IF v_checkout.status NOT IN ('created','pending') THEN
  RAISE EXCEPTION 'V276_NON_OPEN_CHECKOUT_REQUIRES_RECONCILIATION'; END IF;

 IF v_member.id IS NOT NULL THEN
  IF (v_member.provider IS NOT NULL AND v_member.provider<>'flutterwave')
    OR (v_member.provider_customer_id IS NOT NULL
      AND v_member.provider_customer_id IS DISTINCT FROM p_customer_id)
    OR (v_member.provider_subscription_id IS NOT NULL
      AND v_member.provider_subscription_id IS DISTINCT FROM p_subscription_id)
  THEN RAISE EXCEPTION 'V276_PROVIDER_SUBSCRIPTION_IDENTITY_CONFLICT'; END IF;
  IF v_member.current_period_end IS NOT NULL
    AND p_period_end<=v_member.current_period_end
  THEN RAISE EXCEPTION 'V276_DOUBLE_EXTENSION_NOT_VERIFIED'; END IF;
 END IF;

 -- Unique indexes already exist for provider_event_key and transaction_id.
 -- All three writes commit or roll back as ONE database transaction.
 INSERT INTO public.payment_events(
  provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload
 ) VALUES ('flutterwave',p_event_key,'charge.completed',
  p_user_id,p_plan_id,p_amount,'USD','successful',
  jsonb_build_object('transaction_id',p_tx_id,
   'checkout_reference',p_checkout_reference,
   'paid_period_end',p_period_end,
   'provider_verified_at',p_verified_at,'fulfillment_state','committed_v276')
 );

 UPDATE public.checkout_intents SET status='paid',updated_at=now()
 WHERE id=v_checkout.id AND status IN ('created','pending');
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RAISE EXCEPTION 'V276_CHECKOUT_UPDATE_NOT_COMMITTED'; END IF;

 INSERT INTO public.subscriptions(
  user_id,plan_id,status,provider,provider_customer_id,
  provider_subscription_id,current_period_end
 ) VALUES (p_user_id,p_plan_id,'active','flutterwave',
  p_customer_id,p_subscription_id,p_period_end)
 ON CONFLICT(user_id) DO UPDATE SET
  plan_id=excluded.plan_id,status='active',provider='flutterwave',
  provider_customer_id=COALESCE(excluded.provider_customer_id,public.subscriptions.provider_customer_id),
  provider_subscription_id=COALESCE(excluded.provider_subscription_id,public.subscriptions.provider_subscription_id),
  current_period_end=excluded.current_period_end,updated_at=now()
 -- CRITICAL: conflict-time predicate is re-evaluated on a newly inserted row
 -- from another concurrent transaction. An earlier FOR UPDATE on an absent
 -- member row cannot protect against this insert/update race.
 WHERE (public.subscriptions.provider IS NULL
         OR public.subscriptions.provider='flutterwave')
   AND (public.subscriptions.provider_customer_id IS NULL
         OR excluded.provider_customer_id IS NOT DISTINCT FROM public.subscriptions.provider_customer_id)
   AND (public.subscriptions.provider_subscription_id IS NULL
         OR excluded.provider_subscription_id IS NOT DISTINCT FROM public.subscriptions.provider_subscription_id)
   AND (public.subscriptions.current_period_end IS NULL
         OR excluded.current_period_end>public.subscriptions.current_period_end)
 RETURNING id INTO v_member_id;
 -- If ON CONFLICT WHERE rejected a raced period/identity, RETURNING has no
 -- row: raise to roll back event+checkout too. Operator must reconcile real
 -- provider payment; do not silently acknowledge or extend the same term.
 IF v_member_id IS NULL THEN RAISE EXCEPTION 'V276_ENTITLEMENT_RACE_RECONCILIATION_REQUIRED'; END IF;
 RETURN jsonb_build_object('state','ATOMICALLY_COMMITTED',
  'duplicate',false,'entitlement_extended',true,'new_charge',false);
END;
$v276$;
REVOKE ALL ON FUNCTION public.fulfill_verified_flutterwave_checkout_v276(
 text,text,text,uuid,text,numeric,text,text,timestamptz,timestamptz,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_verified_flutterwave_checkout_v276(
 text,text,text,uuid,text,numeric,text,text,timestamptz,timestamptz,text,text
) TO service_role;
COMMIT;
