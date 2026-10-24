import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateConcurrentEntitlementConflict as verify} from '../src/v276-concurrent-entitlement-guard.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const old=read('docs/operations/candidates/v275-atomic-fulfillment-candidate.sql');
const sql=read('docs/operations/candidates/v276-atomic-fulfillment-candidate.sql');
const now=Date.parse('2026-10-24T08:40:00Z');
const at=x=>new Date(x).toISOString();
const incoming=()=>({transaction_id:'test-payment-1',amount:29,currency:'USD',
 period_end:at(now+30*86400_000),customer_id:'same-1',subscription_id:'sub-1'});
test('V276 is a NEW isolated candidate, no auto-migration or live RPC replacement',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.fulfill_verified_flutterwave_checkout_v276\(/);
 assert.match(old,/CREATE OR REPLACE FUNCTION public\.fulfill_verified_flutterwave_checkout_v275\(/);
 assert.doesNotMatch(sql,/CREATE OR REPLACE FUNCTION public\.activate_subscription_from_payment/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM public\.subscriptions|TRUNCATE|cron\.alter_job/);
 assert.match(read('docs/operations/2026-10-24-v276-concurrent-fulfillment-guard.md'),/DO NOT APPLY/);
});
test('guard is inside ON CONFLICT clause and follows transaction event+checkout writes',()=>{
 const a=sql.indexOf('INSERT INTO public.payment_events('),b=sql.indexOf('UPDATE public.checkout_intents SET'),
  c=sql.indexOf('INSERT INTO public.subscriptions('),guard=sql.lastIndexOf('WHERE (public.subscriptions.provider IS NULL'),ret=sql.indexOf('RETURNING id INTO v_member_id',guard);
 assert.ok(a>0&&b>a&&c>b&&guard>c&&ret>guard);
 assert.match(sql,/ON CONFLICT\(user_id\) DO UPDATE SET/);
 assert.match(sql,/excluded\.current_period_end>public\.subscriptions\.current_period_end/);
 assert.match(sql,/IF v_member_id IS NULL THEN RAISE EXCEPTION 'V276_ENTITLEMENT_RACE_RECONCILIATION_REQUIRED'/);
});
test('conflict guard prevents provider and customer reassignment and same-period double renewal',()=>{
 const clause=sql.slice(sql.lastIndexOf('WHERE (public.subscriptions.provider IS NULL'),sql.indexOf('RETURNING id INTO v_member_id;'));
 for(const s of ["public.subscriptions.provider='flutterwave'",
 'excluded.provider_customer_id IS NOT DISTINCT FROM public.subscriptions.provider_customer_id',
 'excluded.provider_subscription_id IS NOT DISTINCT FROM public.subscriptions.provider_subscription_id',
 'excluded.current_period_end>public.subscriptions.current_period_end'])
 assert.ok(clause.includes(s),s);
});
test('first payment with no subscription can be candidate-eligible but cannot authorize actual access',()=>{
 const v=verify({},incoming(),now);
 assert.equal(v.verdict,'CANDIDATE_CONFLICT_PREDICATE_ALLOWS');
 assert.equal(v.actual_database_execution,false);
 assert.equal(v.paid_period_changed,false);
 assert.equal(v.commerce_unlocked,false);
});
test('two distinct concurrent payments with same user and same term: second must go to reconciliation',()=>{
 const first=incoming();
 const afterFirst={provider:'flutterwave',customer_id:first.customer_id,
  subscription_id:first.subscription_id,current_period_end:first.period_end};
 const second={...incoming(),transaction_id:'test-payment-2'};
 const v=verify(afterFirst,second,now);
 assert.equal(v.checks.monotonic,false);
 assert.equal(v.verdict,'MANUAL_RECONCILIATION_REQUIRED');
 assert.equal(v.payment_acknowledged,false);
 assert.equal(v.new_charge_created,false);
});
test('a genuinely newer, trusted future period may pass the pure conflict check',()=>{
 const oldPeriod=at(now+20*86400_000);
 const x=verify({provider:'flutterwave',customer_id:'same-1',subscription_id:'sub-1',
  current_period_end:oldPeriod},incoming(),now);
 assert.equal(x.checks.monotonic,true);
 assert.equal(x.verdict,'CANDIDATE_CONFLICT_PREDICATE_ALLOWS');
});
test('provider reassignment, customer mismatch, bad currency or invalid term all fail closed',()=>{
 const list=[
 [{provider:'stripe'},incoming()],
 [{provider:'flutterwave',customer_id:'old-user'},incoming()],
 [{provider:'flutterwave',subscription_id:'wrong'},incoming()],
 [{},{...incoming(),currency:'EUR'}],
 [{},{...incoming(),period_end:null}],
 [{},{...incoming(),period_end:at(now-1000)}],
 [{},{...incoming(),period_end:at(now+80*86400_000)}],
 [{},{...incoming(),transaction_id:'white space'}],
 [{},{...incoming(),amount:0}]
 ];
 for(const [existing,payment] of list){
  const result=verify(existing,payment,now);
  assert.equal(result.verdict,'MANUAL_RECONCILIATION_REQUIRED',JSON.stringify(payment));
  assert.equal(result.paid_period_changed,false);
 }
});
test('replay requires exact original committed period, amount, provider identity and paid checkout',()=>{
 for(const pattern of [
 "v_event.raw_payload->>'fulfillment_state'='committed_v276'",
 "v_event.raw_payload->>'checkout_reference'=p_checkout_reference",
 "v_event.amount IS NOT DISTINCT FROM p_amount",
 "v_event.currency IS NOT DISTINCT FROM 'USD'",
 "(v_event.raw_payload->>'paid_period_end')::timestamptz IS NOT DISTINCT FROM p_period_end",
 'v_member.current_period_end>=p_period_end',
 "v_checkout.status='paid'",
 'V276_EVENT_KEY_REUSED_FOR_DIFFERENT_TRANSACTION',
 "V276_LEGACY_OR_PARTIAL_EVENT_REQUIRES_RECONCILIATION"
 ])assert.ok(sql.includes(pattern),pattern);
});
test('only service role can call candidate, never a browser token',()=>{
 assert.match(sql,/SECURITY DEFINER/);
 assert.match(sql,/SET search_path TO 'pg_catalog','public'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated;/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*TO service_role;/);
});
test('no production wiring, live payments, customer writes or broker trading',()=>{
 const src=read('src/v276-concurrent-entitlement-guard.mjs');
 assert.doesNotMatch(src,/\bfetch\s*\(|Deno\.serve|execute_sql|createClient|rpc\(/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.doesNotMatch(read('docs/operations/candidates/v276-atomic-fulfillment-candidate.sql'),/CREATE POLICY|GRANT EXECUTE.*TO authenticated/);
});
