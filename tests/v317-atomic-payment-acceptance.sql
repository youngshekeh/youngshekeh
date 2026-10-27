-- V317 isolated PostgreSQL integration acceptance, synthetic transactions only.
\set ON_ERROR_STOP on

INSERT INTO public.checkout_intents VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','pro','flutterwave',19,'USD','pending','TFA-pro-1',now()),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','pro','flutterwave',19,'USD','pending','TFA-pro-2',now()),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','executive','flutterwave',49,'USD','pending','TFA-exec-3',now()),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','pro','flutterwave',19,'USD','pending','TFA-pro-4',now());

DO $$
DECLARE r jsonb; first_end timestamptz; new_end timestamptz;
BEGIN
  r:=public.commit_verified_flutterwave_payment_v317(
    'v317-test-tx-1','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','TFA-pro-1',
    '20000000-0000-4000-8000-000000000001','customer-test-1','subscription-test-1');
  IF r->>'state'<>'COMMITTED' THEN RAISE EXCEPTION 'initial commit missing'; END IF;
  SELECT current_period_end INTO first_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  IF first_end<now()+interval '28 days' OR first_end>now()+interval '32 days'
    THEN RAISE EXCEPTION 'invalid initial membership period'; END IF;
  IF (SELECT status FROM public.checkout_intents
    WHERE id='20000000-0000-4000-8000-000000000001')<>'paid'
    THEN RAISE EXCEPTION 'checkout intent not paid'; END IF;

  r:=public.commit_verified_flutterwave_payment_v317(
    'v317-test-tx-1','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','TFA-pro-1',
    '20000000-0000-4000-8000-000000000001','customer-test-1','subscription-test-1');
  IF r->>'state'<>'ALREADY_COMMITTED'
    THEN RAISE EXCEPTION 'duplicate webhook not idempotent'; END IF;
  SELECT current_period_end INTO new_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  IF new_end IS DISTINCT FROM first_end THEN RAISE EXCEPTION 'duplicate extended paid period'; END IF;
  IF (SELECT count(*) FROM public.payment_events
    WHERE raw_payload->>'transaction_id'='v317-test-tx-1')<>1
    THEN RAISE EXCEPTION 'duplicate payment event rows'; END IF;
END $$;

DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-invalid-amount','10000000-0000-4000-8000-000000000001',
    'pro',18,'USD','TFA-pro-2','20000000-0000-4000-8000-000000000002',null,null);
  RAISE EXCEPTION 'test expected rejection was not raised';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'v317_provider_plan_parity_failed%' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-wrong-reference','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','TFA-another-reference','20000000-0000-4000-8000-000000000002',null,null);
  RAISE EXCEPTION 'test expected rejection was not raised';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'v317_checkout_intent_evidence_missing%' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-bad-recurring','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','',null,'someone-elses-customer',null);
  RAISE EXCEPTION 'test expected rejection was not raised';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'v317_recurring_member_binding_unverified%' THEN RAISE; END IF;
END $$;

DO $$
DECLARE before_end timestamptz; after_end timestamptz; r jsonb;
BEGIN
  SELECT current_period_end INTO before_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  r:=public.commit_verified_flutterwave_payment_v317(
    'v317-test-renewal','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','',null,'customer-test-1','subscription-test-1');
  IF r->>'state'<>'COMMITTED' THEN RAISE EXCEPTION 'valid renewal not committed'; END IF;
  SELECT current_period_end INTO after_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  IF after_end IS DISTINCT FROM before_end+interval '1 month'
    THEN RAISE EXCEPTION 'renewal period incorrect'; END IF;
  r:=public.commit_verified_flutterwave_payment_v317(
    'v317-test-renewal','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','',null,'customer-test-1','subscription-test-1');
  IF r->>'state'<>'ALREADY_COMMITTED' THEN RAISE EXCEPTION 'renewal duplicate not detected'; END IF;
  IF (SELECT current_period_end FROM public.subscriptions
    WHERE user_id='10000000-0000-4000-8000-000000000001') IS DISTINCT FROM after_end
    THEN RAISE EXCEPTION 'renewal was double applied'; END IF;
END $$;

-- Existing legacy event may represent a partially committed transaction.
-- Do not credit it again automatically without an explicit recovery ledger.
INSERT INTO public.payment_events
 (provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload)
 VALUES ('flutterwave','legacy-id-1','charge.completed',
 '10000000-0000-4000-8000-000000000001',
 'pro',19,'USD','successful','{"transaction_id":"v317-legacy-tx"}');

DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-legacy-tx','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','TFA-pro-2',
    '20000000-0000-4000-8000-000000000002',null,null);
  RAISE EXCEPTION 'test expected manual hold was not raised';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'v317_previous_receipt_requires_manual_reconciliation%'
    THEN RAISE; END IF;
END $$;

-- Inject a downstream subscription failure. Event insert + intent update must
-- ROLLBACK in their entirety. The identical payment can then be retried once.
CREATE FUNCTION public.v317_test_fail_subscription() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.plan_id='executive' THEN
    RAISE EXCEPTION 'simulated_downstream_subscription_failure';
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER v317_test_fail_subscription
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.v317_test_fail_subscription();

DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-fault-injected-tx','10000000-0000-4000-8000-000000000001',
    'executive',49,'USD','TFA-exec-3',
    '20000000-0000-4000-8000-000000000003',null,null);
  RAISE EXCEPTION 'test expected simulated failure was not raised';
EXCEPTION WHEN others THEN
  IF SQLERRM <> 'simulated_downstream_subscription_failure' THEN RAISE; END IF;
END $$;
DROP TRIGGER v317_test_fail_subscription ON public.subscriptions;
DROP FUNCTION public.v317_test_fail_subscription();

DO $$
DECLARE r jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.payment_events WHERE raw_payload->>'transaction_id'='v317-fault-injected-tx')
    THEN RAISE EXCEPTION 'failed activation left a poisoned payment event'; END IF;
  IF (SELECT status FROM public.checkout_intents
    WHERE id='20000000-0000-4000-8000-000000000003') <> 'pending'
    THEN RAISE EXCEPTION 'failed activation left paid checkout'; END IF;
  IF (SELECT plan_id FROM public.subscriptions WHERE
    user_id='10000000-0000-4000-8000-000000000001') <> 'pro'
    THEN RAISE EXCEPTION 'failed activation altered membership'; END IF;
  r:=public.commit_verified_flutterwave_payment_v317(
    'v317-fault-injected-tx','10000000-0000-4000-8000-000000000001',
    'executive',49,'USD','TFA-exec-3',
    '20000000-0000-4000-8000-000000000003',null,null);
  IF r->>'state'<>'COMMITTED'
    THEN RAISE EXCEPTION 'legitimate retry failed'; END IF;
  IF (SELECT plan_id FROM public.subscriptions WHERE
    user_id='10000000-0000-4000-8000-000000000001') <> 'executive'
    THEN RAISE EXCEPTION 'successful retry not activated'; END IF;
END $$;

-- A second user's checkout and unsigned caller cannot hijack the receipt.
DO $$
BEGIN
  PERFORM public.commit_verified_flutterwave_payment_v317(
    'v317-foreign-owner','10000000-0000-4000-8000-000000000001',
    'pro',19,'USD','TFA-pro-4',
    '20000000-0000-4000-8000-000000000004',null,null);
  RAISE EXCEPTION 'expected wrong-user denial missing';
EXCEPTION WHEN others THEN
  IF SQLERRM NOT LIKE 'v317_checkout_intent_evidence_missing%' THEN RAISE; END IF;
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon'::regrole,
    'public.commit_verified_flutterwave_payment_v317(text,uuid,text,numeric,text,text,uuid,text,text)'::regprocedure,
    'EXECUTE') OR
    has_function_privilege('authenticated'::regrole,
    'public.commit_verified_flutterwave_payment_v317(text,uuid,text,numeric,text,text,uuid,text,text)'::regprocedure,
    'EXECUTE') THEN
    RAISE EXCEPTION 'public browser roles can execute payment activation';
  END IF;
  IF NOT has_function_privilege('service_role'::regrole,
    'public.commit_verified_flutterwave_payment_v317(text,uuid,text,numeric,text,text,uuid,text,text)'::regprocedure,
    'EXECUTE') THEN
    RAISE EXCEPTION 'server service role cannot execute payment activation';
  END IF;
END $$;

SELECT 'V317_POSTGRES_ATOMIC_PAYMENT_ACCEPTANCE_PASSED' AS result;
