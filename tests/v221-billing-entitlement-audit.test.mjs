import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {evaluateEntitlementEvidence,certifyFulfillmentReceipt,describeAudit,LEDGER_AUDIT_VERSION} from '../src/billing-entitlement-audit.mjs';
import {planEligible} from '../src/commercial-gates.mjs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const saved=JSON.parse(file('docs/operations/evidence/v221-billing-audit-20261020.json'));
const NOW=Date.parse(saved.observed_at);
const aggregate=()=>({...saved});
const receipt=()=>({
 observed_at:new Date(NOW-15000).toISOString(),
 signature_valid:true,provider_reverified:true,
 transaction_reference_matches:true,customer_matches:true,plan_matches:true,
 currency_matches:true,amount_matches:true,provider_status:'successful',
 atomic_fulfillment_committed:true,event_dedupe_record_committed:true,
 entitlement_upsert_committed:true,checkout_paid_committed:true,
 membership_status:'active',
 membership_checked_at:new Date(NOW-5000).toISOString(),
 current_period_end:new Date(NOW+29*24*3600000).toISOString(),
 legacy_historical_replay:false,event_is_expired:false
});
test('actual historical signed payment and past due term cannot authorize new entitlement',()=>{
 const r=evaluateEntitlementEvidence(aggregate(),NOW);
 assert.equal(r.version,LEDGER_AUDIT_VERSION);
 assert.equal(r.state,'LAUNCH_HOLD');
 assert.equal(r.reason,'HISTORICAL_TERM_EXPIRED');
 assert.equal(r.eligible_for_live_checkout,false);
 assert.equal(r.may_reactivate_historical_payment,false);
 assert.equal(r.unlocked_entitlements,0);
 const report=describeAudit(r);
 assert.match(report,/HISTORICAL_TERM_EXPIRED/);
 assert.doesNotMatch(report,/user_id|provider_reference|tx_ref|@example/);
});
test('missing, invalid or stale snapshot cannot certify entitlements',()=>{
 for(const value of [undefined,-1,1.2,'1',NaN]){
  const x=aggregate();x.successful_signed_events=value;
  assert.equal(evaluateEntitlementEvidence(x,NOW).reason,'INCOMPLETE_LEDGER_COUNTS');
 }
 assert.equal(evaluateEntitlementEvidence(aggregate(),NOW+16*60_000).reason,'STALE_OR_ABSENT_OPERATOR_EVIDENCE');
});
test('mismatched aggregate counts are rejected without hidden repair',()=>{
 const x=aggregate();x.matched_paid_checkouts=2;
 assert.equal(evaluateEntitlementEvidence(x,NOW).reason,'INCONSISTENT_LEDGER_COUNTS');
 x.matched_paid_checkouts=1;x.matching_active_entitlements=1;x.active_memberships=0;
 assert.equal(evaluateEntitlementEvidence(x,NOW).reason,'INCONSISTENT_LEDGER_COUNTS');
});
test('even matching active aggregates require a specific transaction-linked provider receipt',()=>{
 const x=aggregate();x.matching_active_entitlements=1;x.matching_past_due_entitlements=0;
 x.active_memberships=1;x.past_due_memberships=0;
 const r=evaluateEntitlementEvidence(x,NOW);
 assert.equal(r.state,'LAUNCH_HOLD');
 assert.equal(r.reason,'LINKED_TRANSACTION_PROOF_REQUIRED');
});
test('good synthetic receipt is only a *local* verdict, never an unlock or write',()=>{
 const r=certifyFulfillmentReceipt(receipt(),NOW);
 assert.equal(r.state,'FULFILLMENT_RECEIPT_VERIFIED');
 assert.equal(r.checkout_unlocked,false);
 assert.equal(r.paid_charge_created,false);
 assert.equal(r.entitlement_mutated,false);
});
test('failed subscription activation after recorded event cannot be called fulfilled',()=>{
 const x=receipt();x.atomic_fulfillment_committed=false;x.entitlement_upsert_committed=false;
 const r=certifyFulfillmentReceipt(x,NOW);
 assert.equal(r.state,'NOT_CERTIFIED');
 assert.equal(r.reason,'FULFILLMENT_TRANSACTION_NOT_COMMITTED');
});
test('duplicate event without confirmed atomic commit must not trigger phantom access',()=>{
 const x=receipt();x.event_dedupe_record_committed=true;x.checkout_paid_committed=true;
 x.entitlement_upsert_committed=false;
 assert.equal(certifyFulfillmentReceipt(x,NOW).reason,'FULFILLMENT_TRANSACTION_NOT_COMMITTED');
});
test('never accept unsigned, unverified or mismatched provider transactions',()=>{
 for(const field of ['signature_valid','provider_reverified']){
  const x=receipt();x[field]=false;
  assert.equal(certifyFulfillmentReceipt(x,NOW).state,'NOT_CERTIFIED');
 }
 for(const field of ['transaction_reference_matches','customer_matches','plan_matches','currency_matches','amount_matches']){
  const x=receipt();x[field]=false;
  assert.equal(certifyFulfillmentReceipt(x,NOW).reason,'PAYMENT_IDENTITY_OR_AMOUNT_MISMATCH',field);
 }
});
test('an expired term or old replay cannot extend membership without a new paid transaction',()=>{
 const x=receipt();x.legacy_historical_replay=true;
 assert.equal(certifyFulfillmentReceipt(x,NOW).reason,'STALE_OR_REPLAYED_PAYMENT');
 x.legacy_historical_replay=false;x.event_is_expired=true;
 assert.equal(certifyFulfillmentReceipt(x,NOW).reason,'STALE_OR_REPLAYED_PAYMENT');
 x.event_is_expired=false;x.current_period_end=new Date(NOW-1000).toISOString();
 assert.equal(certifyFulfillmentReceipt(x,NOW).reason,'ACTIVE_TERM_NOT_CONFIRMED');
});
test('public checkout guard remains disabled and deployed active membership is still withheld',()=>{
 const frontend=file('src/checkout.ts');
 assert.match(frontend,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 const fake={
  ok:true,generated_at:new Date(NOW-1000).toISOString(),state:'READY_FOR_CONTROLLED_LIVE_TEST',
  ready_for_checkout:true,live_flow_verified:false,
  gates:{provider_plan_parity:'PASS',signed_payment_evidence:'PASS',active_entitlement_evidence:'WITHHELD'},
  plans:[{plan_id:'pro',local_price_usd:79,currency:'USD',recurring:true,provider_verified:true}]
 };
 assert.equal(planEligible('pro',fake,NOW),false);
});
test('runbook and CLI do not trigger checkout, refund, email or subscription mutation',()=>{
 const script=file('scripts/v221-billing-audit.mjs'),engine=file('src/billing-entitlement-audit.mjs');
 assert.doesNotMatch(script+engine,/\bfetch\s*\(|sendBeacon|XMLHttpRequest|localStorage|sessionStorage|supabase\.from\(|api\.flutterwave/);
 assert.match(script,/entitlement-audit\.json/);
 assert.match(script,/entitlement-audit\.txt/);
 assert.match(file('src/launch-readiness.mjs'),/consecutive_successes >= 2/);
});
