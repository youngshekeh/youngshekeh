-- V318 REVIEW ONLY. Not applied to production.
-- Provider authentication, subscription identity AND current cancelled
-- provider status must be externally verified before this privileged RPC.
-- Canceling recurring billing preserves an already-earned term until expiry.
-- Atomic event receipt + subscription status update, never separate HTTP writes.
BEGIN;
CREATE OR REPLACE FUNCTION public.commit_verified_flutterwave_cancellation_v318(
  p_subscription_id text,
  p_provider_customer_id text,
  p_provider_plan_id text,
  p_event_key text,
  p_provider_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid;
  v_sub public.subscriptions%ROWTYPE;
  v_mapping public.billing_plan_mappings%ROWTYPE;
  v_event public.payment_events%ROWTYPE;
  v_new_id uuid;
  v_key text;
BEGIN
  IF p_subscription_id IS NULL OR length(btrim(p_subscription_id)) < 1
     OR length(p_subscription_id) > 128
     OR p_provider_customer_id IS NULL OR length(btrim(p_provider_customer_id)) < 1
     OR length(p_provider_customer_id) > 128
     OR p_provider_plan_id IS NULL OR length(btrim(p_provider_plan_id)) < 1
     OR length(p_provider_plan_id) > 128
     OR p_event_key IS NULL OR length(btrim(p_event_key)) < 1
     OR length(p_event_key) > 150
     OR p_provider_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'v318_provider_cancellation_not_verified';
  END IF;
  v_key := 'cancel:' || p_event_key;

  -- Discover user ID without taking a row lock. Payment activation acquires
  -- advisory lock FIRST, then the subscription row. Match that ordering.
  SELECT user_id INTO v_user_id FROM public.subscriptions
    WHERE provider='flutterwave' AND provider_subscription_id=p_subscription_id
      AND provider_customer_id=p_provider_customer_id
    LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'v318_cancellation_member_binding_missing';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text,317));

  SELECT * INTO v_sub FROM public.subscriptions
    WHERE user_id=v_user_id AND provider='flutterwave'
      AND provider_subscription_id=p_subscription_id
      AND provider_customer_id=p_provider_customer_id
    FOR UPDATE;
  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'v318_cancellation_subscription_changed';
  END IF;

  SELECT * INTO v_mapping FROM public.billing_plan_mappings
    WHERE provider='flutterwave' AND plan_id=v_sub.plan_id
      AND provider_plan_id=p_provider_plan_id AND is_active=true
    LIMIT 1;
  IF v_mapping.plan_id IS NULL THEN
    RAISE EXCEPTION 'v318_cancellation_plan_mismatch';
  END IF;

  SELECT * INTO v_event FROM public.payment_events
    WHERE provider='flutterwave' AND provider_event_key=v_key LIMIT 1;
  IF FOUND THEN
    IF v_event.user_id IS DISTINCT FROM v_sub.user_id
      OR v_event.plan_id IS DISTINCT FROM v_sub.plan_id
      OR v_event.raw_payload->>'v318_atomic_cancellation' IS DISTINCT FROM 'true'
      OR v_event.raw_payload->>'subscription_id' IS DISTINCT FROM p_subscription_id
      OR v_sub.status IS DISTINCT FROM 'canceled' THEN
      RAISE EXCEPTION 'v318_cancellation_replay_inconsistent_manual_hold';
    END IF;
    RETURN pg_catalog.jsonb_build_object('ok',true,'state','ALREADY_COMMITTED');
  END IF;

  -- Repeated new events against a canceled subscription are harmless.
  IF v_sub.status NOT IN ('active','trialing','canceled') THEN
    RAISE EXCEPTION 'v318_cancellation_unexpected_subscription_status';
  END IF;

  INSERT INTO public.payment_events
    (provider,provider_event_key,event_type,user_id,plan_id,status,raw_payload)
  VALUES
    ('flutterwave',v_key,'subscription.cancelled',
      v_sub.user_id,v_sub.plan_id,'canceled',
      pg_catalog.jsonb_build_object(
        'subscription_id',p_subscription_id,
        'provider_customer_id',p_provider_customer_id,
        'provider_plan_id',p_provider_plan_id,
        'v318_atomic_cancellation',true))
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_id;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'v318_cancellation_receipt_conflict_manual_hold';
  END IF;

  UPDATE public.subscriptions SET status='canceled',updated_at=now()
    WHERE id=v_sub.id;
  -- No change to current_period_end, plan, user, payment amounts or tokens.
  RETURN pg_catalog.jsonb_build_object(
     'ok',true,'state','CANCELED_RENEWAL_OFF',
     'current_period_end',v_sub.current_period_end);
END
$function$;

REVOKE ALL ON FUNCTION public.commit_verified_flutterwave_cancellation_v318(
 text,text,text,text,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_verified_flutterwave_cancellation_v318(
 text,text,text,text,text
) TO service_role;
COMMIT;
