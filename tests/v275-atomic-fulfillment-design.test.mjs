import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessAtomicFulfillmentCandidate} from '../src/v275-atomic-fulfillment-admission.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('docs/operations/candidates/v275-atomic-fulfillment-candidate.sql');
const now=Date.parse('2026-10-24T08:00:00Z'),at=v=>new Date(v).toISOString();
const good=()=>({verified_at:at(now-1000),period_end:at(now+30*86_400_000),
 signature_valid:true,provider_reverified:true,provider_status:'successful',
 user_matches:true,plan_matches:true,reference_matches:true,amount_matches:true,
 currency:'USD',event_checkout_entitlement_atomic:true,unique_transaction_id:true,
 duplicate_transaction_noop:true,legacy_partial_requires_review:true,
 service_role_only:true,db_stable:true,sandbox_tests_passed:true,operator_approved:true});
test('V275 candidate cannot be auto applied or replace legacy payment function',()=>{
 assert.ok(sql.startsWith('-- V275 CANDIDATE ONLY'));
 assert.ok(sql.includes('CREATE OR REPLACE FUNCTION public.fulfill_verified_flutterwave_checkout_v275'));
 assert.ok(!sql.includes('CREATE OR REPLACE FUNCTION public.activate_subscription_from_payment'));
 assert.ok(!sql.includes('DROP TABLE')&&!sql.includes('TRUNCATE'));
 assert.ok(read('docs/operations/2026-10-24-v275-atomic-fulfillment-design.md').includes('DO NOT APPLY'));
});
test('function requires security definer and service-role-only execution',()=>{
 for(const x of ['BEGIN;','COMMIT;','SECURITY DEFINER',
 "SET search_path TO 'pg_catalog','public'",'FROM PUBLIC, anon, authenticated;',
 'TO service_role;'])assert.ok(sql.includes(x),x);
});
test('event checkout and entitlement are written sequentially within one function',()=>{
 const e=sql.indexOf('INSERT INTO public.payment_events('),
  c=sql.indexOf('UPDATE public.checkout_intents SET status'),
  s=sql.indexOf('INSERT INTO public.subscriptions(');
 assert.ok(e>0&&c>e&&s>c);
 assert.ok(sql.includes('GET DIAGNOSTICS v_rows=ROW_COUNT'));
 assert.ok(sql.includes("fulfillment_state','committed_v275'"));
 assert.ok(sql.includes('V275_ENTITLEMENT_NOT_COMMITTED'));
 assert.ok(sql.includes('ATOMICALLY_COMMITTED'));
});
test('duplicate event only produces NOOP on matching durable committed evidence',()=>{
 for(const x of ["raw_payload->>'transaction_id'=p_tx_id",
 "v_event.raw_payload->>'fulfillment_state'='committed_v275'",
 "v_checkout.status='paid'","v_member.current_period_end IS NOT NULL",
 "ALREADY_COMMITTED_NOOP",'entitlement_extended\',false',
 'V275_LEGACY_OR_PARTIAL_EVENT_REQUIRES_RECONCILIATION'])
 assert.ok(sql.includes(x),x);
});
test('enforces amount, currency, provider status, plan and term before SQL writes',()=>{
 for(const x of ["p_provider_status IS DISTINCT FROM 'successful'",
 "p_currency IS DISTINCT FROM 'USD'","v_checkout.amount IS DISTINCT FROM p_amount",
 'v_checkout.user_id IS DISTINCT FROM p_user_id',
 'p_period_end<=now()',"p_period_end>now()+interval '65 days'",
 "m.provider='flutterwave'","m.currency='USD'","m.recurring=true",
 'p_period_end<=v_member.current_period_end'])
 assert.ok(sql.includes(x),x);
});
test('pure evaluator can never launch real commerce even if simulated checks pass',()=>{
 const v=assessAtomicFulfillmentCandidate(good(),now);
 assert.equal(v.state,'DESIGN_HOLD');
 assert.deepEqual(v.missing,[]);
 assert.equal(v.production_rpc_deployed,false);
 assert.equal(v.payment_processing_enabled,false);
 assert.equal(v.customer_records_changed,false);
 assert.equal(v.commercial_launch_certified,false);
});
test('missing provider proof, term, idempotency or operational release fails closed',()=>{
 for(const change of [{signature_valid:false},{provider_reverified:false},
 {user_matches:false},{amount_matches:false},{currency:'NGN'},
 {period_end:null},{period_end:at(now-1000)},
 {period_end:at(now+70*86_400_000)},
 {verified_at:at(now-12*60_000)},{event_checkout_entitlement_atomic:false},
 {unique_transaction_id:false},{duplicate_transaction_noop:false},
 {legacy_partial_requires_review:false},{service_role_only:false},
 {db_stable:false},{operator_approved:false}]){
  const v=assessAtomicFulfillmentCandidate({...good(),...change},now);
  assert.ok(v.missing.length>0,JSON.stringify(change));
  assert.equal(v.payment_processing_enabled,false);
 }
});
test('no network, provider checkout, database or scheduler mutation performed by evaluator',()=>{
 const m=read('src/v275-atomic-fulfillment-admission.mjs');
 assert.ok(!m.includes('fetch(')&&!m.includes('Deno.serve')&&!m.includes('execute_sql'));
 assert.ok(read('src/checkout.ts').includes('CHECKOUT_SERVER_GUARD_DEPLOYED=false'));
 assert.ok(read('supabase/functions/create-checkout/index.ts').includes('V272_CHARGES_ENABLED=false'));
});
