-- V318 standalone cancellation integration scenarios.
-- Run after V317 fixture + V317 schema + V317 acceptance, in ephemeral CI.
\set ON_ERROR_STOP on

DO $$
DECLARE
  result jsonb;
  before_end timestamptz;
  after_end timestamptz;
BEGIN
  result:=public.commit_verified_flutterwave_payment_v317(
    'v318-init-2','10000000-0000-4000-8000-000000000002',
    'pro',19,'USD','TFA-pro-4',
    '20000000-0000-4000-8000-000000000004',
    'customer-test-2','subscription-test-2');
  IF result->>'state'<>'COMMITTED' THEN RAISE EXCEPTION 'v318 fixture payment failed'; END IF;
  SELECT current_period_end INTO before_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000002';

  result:=public.commit_verified_flutterwave_cancellation_v318(
    'subscription-test-2','customer-test-2','101','v318-cancel-first','cancelled');
  IF result->>'state'<>'CANCELED_RENEWAL_OFF'
    THEN RAISE EXCEPTION 'first cancellation failed'; END IF;
  IF (SELECT status FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000002') <> 'canceled'
    THEN RAISE EXCEPTION 'subscription not cancelled'; END IF;
  SELECT current_period_end INTO after_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000002';
  IF before_end IS DISTINCT FROM after_end
    THEN RAISE EXCEPTION 'cancellation shortened earned paid access'; END IF;

  result:=public.commit_verified_flutterwave_cancellation_v318(
    'subscription-test-2','customer-test-2','101','v318-cancel-first','cancelled');
  IF result->>'state'<>'ALREADY_COMMITTED'
    THEN RAISE EXCEPTION 'same cancellation event not idempotent'; END IF;
  IF (SELECT count(*) FROM public.payment_events
    WHERE provider_event_key='cancel:v318-cancel-first')<>1
    THEN RAISE EXCEPTION 'duplicate cancellation event inserted'; END IF;

  result:=public.commit_verified_flutterwave_payment_v317(
    'v318-renew-after-cancel','10000000-0000-4000-8000-000000000002',
    'pro',19,'USD','',null,'customer-test-2','subscription-test-2');
  IF result->>'state'<>'COMMITTED' OR (SELECT status FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000002') <> 'active'
    THEN RAISE EXCEPTION 'verified renewal did not reactivate'; END IF;

  BEGIN
    PERFORM public.commit_verified_flutterwave_cancellation_v318(
      'subscription-test-2','customer-test-2','101','v318-cancel-first','cancelled');
    RAISE EXCEPTION 'old cancellation replay should be held';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'v318_cancellation_replay_inconsistent_manual_hold%' THEN RAISE; END IF;
  END;
  IF (SELECT status FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000002') <> 'active'
    THEN RAISE EXCEPTION 'old cancellation incorrectly stopped renewal'; END IF;

  result:=public.commit_verified_flutterwave_cancellation_v318(
    'subscription-test-2','customer-test-2','101','v318-cancel-later','cancelled');
  IF result->>'state'<>'CANCELED_RENEWAL_OFF'
    THEN RAISE EXCEPTION 'new, independently verified cancellation failed'; END IF;
END $$;

-- Wrong plan, customer or provider status MUST reject without event writes.
DO $$
BEGIN
  BEGIN
    PERFORM public.commit_verified_flutterwave_cancellation_v318(
      'subscription-test-2','customer-test-2','102','v318-bad-plan','cancelled');
    RAISE EXCEPTION 'wrong plan accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'v318_cancellation_plan_mismatch%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.commit_verified_flutterwave_cancellation_v318(
      'subscription-test-2','other-customer','101','v318-bad-customer','cancelled');
    RAISE EXCEPTION 'wrong customer accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'v318_cancellation_member_binding_missing%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.commit_verified_flutterwave_cancellation_v318(
      'subscription-test-2','customer-test-2','101','v318-bad-status','active');
    RAISE EXCEPTION 'unverified cancellation status accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE 'v318_provider_cancellation_not_verified%' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.payment_events WHERE
      provider_event_key IN ('cancel:v318-bad-plan','cancel:v318-bad-customer','cancel:v318-bad-status'))
    THEN RAISE EXCEPTION 'invalid cancellation wrote a ledger row'; END IF;
END $$;

-- Intentionally break only the status update, then prove the event INSERT
-- disappears with the failed transaction. Retry must be safe.
CREATE FUNCTION public.v318_test_cancel_failure() RETURNS trigger
LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status='canceled' THEN RAISE EXCEPTION 'v318_simulated_cancel_write_failure'; END IF;
  RETURN NEW;
END $function$;
CREATE TRIGGER v318_cancel_test_fail
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.v318_test_cancel_failure();

DO $$
BEGIN
  BEGIN
    PERFORM public.commit_verified_flutterwave_cancellation_v318(
      'subscription-test-1','customer-test-1','102',
      'v318-failure-injected','cancelled');
    RAISE EXCEPTION 'injected failure did not trigger';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'v318_simulated_cancel_write_failure' THEN RAISE; END IF;
  END;
END $$;
DROP TRIGGER v318_cancel_test_fail ON public.subscriptions;
DROP FUNCTION public.v318_test_cancel_failure();

DO $$
DECLARE result jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.payment_events
      WHERE provider_event_key='cancel:v318-failure-injected')
    THEN RAISE EXCEPTION 'cancellation failure left poisoned event'; END IF;
  IF (SELECT status FROM public.subscriptions
      WHERE user_id='10000000-0000-4000-8000-000000000001') <> 'active'
    THEN RAISE EXCEPTION 'failed cancellation changed owner status'; END IF;
  result:=public.commit_verified_flutterwave_cancellation_v318(
    'subscription-test-1','customer-test-1','102',
    'v318-failure-injected','cancelled');
  IF result->>'state'<>'CANCELED_RENEWAL_OFF' THEN RAISE EXCEPTION 'retry did not commit'; END IF;
  IF (SELECT count(*) FROM public.payment_events
    WHERE provider_event_key='cancel:v318-failure-injected')<>1
    THEN RAISE EXCEPTION 'retry inserted incorrect event count'; END IF;
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon'::regrole,
    'public.commit_verified_flutterwave_cancellation_v318(text,text,text,text,text)'::regprocedure,
    'EXECUTE') OR
    has_function_privilege('authenticated'::regrole,
    'public.commit_verified_flutterwave_cancellation_v318(text,text,text,text,text)'::regprocedure,
    'EXECUTE') THEN RAISE EXCEPTION 'browser roles may cancel subscriptions'; END IF;
  IF NOT has_function_privilege('service_role'::regrole,
    'public.commit_verified_flutterwave_cancellation_v318(text,text,text,text,text)'::regprocedure,
    'EXECUTE') THEN RAISE EXCEPTION 'service_role missing cancellation EXECUTE'; END IF;
END $$;

SELECT 'V318_ATOMIC_CANCELLATION_ACCEPTANCE_PASSED' AS result;
