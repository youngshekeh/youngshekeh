-- V278 RECURRING RENEWAL CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION.
-- Isolated, never invoked by live webhook. Trust a future HMAC+provider-verified
-- private service_role handler, NOT any value from an unsigned browser.
BEGIN;
CREATE OR REPLACE FUNCTION public.fulfill_verified_flutterwave_renewal_v278(
 p_tx_id text, p_event_key text, p_user_id uuid, p_plan_id text,
 p_customer_id text, p_subscription_id text,
 p_amount numeric, p_currency text, p_provider_status text,
 p_verified_at timestamptz,
 p_period_start timestamptz, p_period_end timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $v278$
DECLARE
 v_sub public.subscriptions%ROWTYPE;
 v_event public.payment_events%ROWTYPE;
 v_updated uuid;
BEGIN
 PERFORM set_config('lock_timeout','3s',true);
 -- No local date inference, no anonymous membership, no free plan activation.
 IF p_user_id IS NULL OR p_plan_id NOT IN ('pro','executive','business','enterprise')
  OR p_tx_id IS NULL OR length(p_tx_id) NOT BETWEEN 1 AND 128
  OR p_tx_id !~ '^[A-Za-z0-9_-]+$'
  OR p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 128
  OR p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 1 AND 128
  OR p_subscription_id IS NULL OR length(p_subscription_id) NOT BETWEEN 1 AND 128
  OR p_amount IS NULL OR p_amount<=0 OR p_currency IS DISTINCT FROM 'USD'
  OR p_provider_status IS DISTINCT FROM 'successful'
  OR p_verified_at IS NULL
  OR p_verified_at NOT BETWEEN now()-interval '10 minutes' AND now()+interval '60 seconds'
  OR p_period_start IS NULL OR p_period_end IS NULL
  OR p_period_end <= p_period_start
  OR p_period_end <= now()
  OR p_period_end > now()+interval '65 days'
  OR p_period_end-p_period_start < interval '25 days'
  OR p_period_end-p_period_start > interval '35 days'
 THEN RAISE EXCEPTION 'V278_PROVIDER_RENEWAL_EVIDENCE_REJECTED'; END IF;

 -- Serialized row lock: two different renewal transactions for the same
 -- provider subscription cannot simultaneously observe the old paid term.
 SELECT * INTO v_sub FROM public.subscriptions
 WHERE provider='flutterwave' AND provider_subscription_id=p_subscription_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'V278_PROVIDER_SUBSCRIPTION_NOT_FOUND'; END IF;
 IF v_sub.user_id IS DISTINCT FROM p_user_id
  OR v_sub.plan_id IS DISTINCT FROM p_plan_id
  OR v_sub.provider_customer_id IS DISTINCT FROM p_customer_id
  OR v_sub.provider_subscription_id IS DISTINCT FROM p_subscription_id
  OR v_sub.status NOT IN ('active','trialing','past_due')
  OR v_sub.current_period_end IS NULL
 THEN RAISE EXCEPTION 'V278_CUSTOMER_OR_PAID_TERM_NOT_VERIFIED'; END IF;

 -- Match real monthly plan and active provider mapping; no guessed price.
 IF NOT EXISTS (
  SELECT 1 FROM public.plans p
  JOIN public.billing_plan_mappings m ON m.plan_id=p.id
  WHERE p.id=p_plan_id AND p.is_active=true
   AND p.price_monthly_usd=p_amount AND m.is_active=true
   AND m.provider='flutterwave' AND m.currency='USD'
   AND m.recurring=true AND m.provider_plan_id IS NOT NULL
 ) THEN RAISE EXCEPTION 'V278_PLAN_AND_AMOUNT_PARITY_REJECTED'; END IF;

 -- An exact provider cycle must attach to the existing committed paid term.
 -- Small clock/date slack admits billing boundary conversion only.
 IF abs(extract(epoch FROM (p_period_start-v_sub.current_period_end)))>36*3600
 THEN RAISE EXCEPTION 'V278_PROVIDER_PERIOD_CONTINUITY_REQUIRED'; END IF;

 -- Durable duplicate check AFTER serial lock. Both unique indexes apply:
 -- (provider,event_key), and (provider,raw_payload.transaction_id).
 IF EXISTS (
  SELECT 1 FROM public.payment_events e
  WHERE e.provider='flutterwave' AND e.provider_event_key=p_event_key
   AND e.raw_payload->>'transaction_id' IS DISTINCT FROM p_tx_id
 ) THEN RAISE EXCEPTION 'V278_EVENT_KEY_TRANSACTION_COLLISION'; END IF;

 SELECT * INTO v_event FROM public.payment_events
 WHERE provider='flutterwave'
  AND (provider_event_key=p_event_key
    OR raw_payload->>'transaction_id'=p_tx_id)
 LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  -- A replay only acknowledges a new-version fully committed renewal
  -- with exact provider TX, plan, amount and cycle plus durable paid term.
  IF v_event.raw_payload->>'fulfillment_state'='renewal_committed_v278'
   AND v_event.raw_payload->>'transaction_id'=p_tx_id
   AND v_event.raw_payload->>'provider_subscription_id'=p_subscription_id
   AND v_event.raw_payload->>'provider_customer_id'=p_customer_id
   AND (v_event.raw_payload->>'paid_period_start')::timestamptz
       IS NOT DISTINCT FROM p_period_start
   AND (v_event.raw_payload->>'paid_period_end')::timestamptz
       IS NOT DISTINCT FROM p_period_end
   AND v_event.user_id=p_user_id AND v_event.plan_id=p_plan_id
   AND v_event.amount IS NOT DISTINCT FROM p_amount
   AND v_event.currency IS NOT DISTINCT FROM 'USD'
   AND v_sub.status='active'
   AND v_sub.current_period_end>=p_period_end
  THEN
   RETURN jsonb_build_object('state','ALREADY_COMMITTED_NOOP',
     'duplicate',true,'entitlement_extended',false,'new_charge',false);
  END IF;
  RAISE EXCEPTION 'V278_LEGACY_OR_PARTIAL_RENEWAL_REQUIRES_RECONCILIATION';
 END IF;

 -- A *different* payment for an already-credited cycle is NOT another month.
 IF p_period_end<=v_sub.current_period_end
 THEN RAISE EXCEPTION 'V278_TERM_ALREADY_COVERED_RECONCILIATION_REQUIRED'; END IF;

 -- These writes are one PostgreSQL function transaction. Any exception
 -- rolls back event claim AND subscription term update.
 INSERT INTO public.payment_events(
  provider,provider_event_key,event_type,user_id,plan_id,
  amount,currency,status,raw_payload
 ) VALUES (
  'flutterwave',p_event_key,'subscription.renewed',p_user_id,p_plan_id,
  p_amount,'USD','successful',
  jsonb_build_object(
   'transaction_id',p_tx_id,
   'provider_customer_id',p_customer_id,
   'provider_subscription_id',p_subscription_id,
   'paid_period_start',p_period_start,
   'paid_period_end',p_period_end,
   'provider_verified_at',p_verified_at,
   'fulfillment_state','renewal_committed_v278')
 );

 UPDATE public.subscriptions SET
  status='active',current_period_end=p_period_end,updated_at=now()
 WHERE id=v_sub.id AND user_id=p_user_id
  AND provider='flutterwave' AND provider_customer_id=p_customer_id
  AND provider_subscription_id=p_subscription_id
  AND status IN ('active','trialing','past_due')
  AND current_period_end<p_period_end
 RETURNING id INTO v_updated;
 IF v_updated IS NULL THEN
  RAISE EXCEPTION 'V278_RENEWAL_UPDATE_REJECTED_AND_ROLLED_BACK';
 END IF;
 RETURN jsonb_build_object('state','ATOMIC_RENEWAL_COMMITTED',
   'duplicate',false,'entitlement_extended',true,'new_charge',false);
END;
$v278$;
REVOKE ALL ON FUNCTION public.fulfill_verified_flutterwave_renewal_v278(
 text,text,uuid,text,text,text,numeric,text,text,timestamptz,timestamptz,timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_verified_flutterwave_renewal_v278(
 text,text,uuid,text,text,text,numeric,text,text,timestamptz,timestamptz,timestamptz
) TO service_role;
COMMIT;
