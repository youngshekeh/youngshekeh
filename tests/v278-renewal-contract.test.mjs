import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sql=read('docs/operations/candidates/v278-atomic-renewal-candidate.sql');
test('renewals have a separate, isolated RPC with no new checkout intents',()=>{
 assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fulfill_verified_flutterwave_renewal_v278'));
 assert.doesNotMatch(sql,/INSERT INTO public.checkout_intents|UPDATE public.checkout_intents|CREATE OR REPLACE FUNCTION public.activate_subscription_from_payment/);
 assert.match(sql,/-- V278 RECURRING RENEWAL CANDIDATE ONLY/);
});
test('receipt must carry provider identifiers, exact monthly cycle, plan and fresh verification',()=>{
 for(const clause of ['p_customer_id IS NULL','p_subscription_id IS NULL',
  "p_provider_status IS DISTINCT FROM 'successful'",
  "p_currency IS DISTINCT FROM 'USD'",
  "p_verified_at NOT BETWEEN now()-interval '10 minutes'",
  "p_period_end-p_period_start < interval '25 days'",
  "p_period_end-p_period_start > interval '35 days'",
  "abs(extract(epoch FROM (p_period_start-v_sub.current_period_end)))>36*3600",
  'p.price_monthly_usd=p_amount',
  "m.provider='flutterwave' AND m.currency='USD'"])
  assert.ok(sql.includes(clause),clause);
});
test('row lock serializes concurrent renewal and same-transaction event/term writes',()=>{
 const lock=sql.indexOf("WHERE provider='flutterwave' AND provider_subscription_id=p_subscription_id"),
  evt=sql.indexOf('INSERT INTO public.payment_events('),
  update=sql.indexOf('UPDATE public.subscriptions SET');
 assert.ok(lock>=0&&sql.slice(lock,lock+135).includes('FOR UPDATE'));
 assert.ok(evt>lock&&update>evt);
 assert.match(sql,/IF v_updated IS NULL THEN/);
 assert.match(sql,/RAISE EXCEPTION 'V278_RENEWAL_UPDATE_REJECTED_AND_ROLLED_BACK'/);
});
test('refund/cancel and legacy partial event cannot be mistaken for active renewal',()=>{
 assert.match(sql,/v_sub.status NOT IN \('active','trialing','past_due'\)/);
 assert.match(sql,/v_event.raw_payload->>'fulfillment_state'='renewal_committed_v278'/);
 assert.match(sql,/V278_LEGACY_OR_PARTIAL_RENEWAL_REQUIRES_RECONCILIATION/);
 assert.match(sql,/V278_TERM_ALREADY_COVERED_RECONCILIATION_REQUIRED/);
 assert.match(sql,/p_period_end<=v_sub.current_period_end/);
});
test('only service-role backend may call isolated renewal function',()=>{
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role;/);
 assert.doesNotMatch(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated;/);
});
test('current production payment webhook untouched, actual provider integration remains unverified',()=>{
 const webhook=read('docs/operations/evidence/v274-supabase-flutterwave-webhook-v7.txt');
 assert.match(webhook,/if\(!intent\)\{const customerId/);
 assert.match(webhook,/recurring:!intent/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('docs/operations/2026-10-24-v278-renewal-integrity.md'),/DO NOT APPLY/);
});
