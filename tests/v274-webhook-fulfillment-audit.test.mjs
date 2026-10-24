import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectWebhookSource,assessWebhookFulfillmentReceipt,assessAggregateReconciliation}
 from '../src/v274-webhook-fulfillment-audit.mjs';
const source=readFileSync(new URL('../docs/operations/evidence/v274-supabase-flutterwave-webhook-v7.txt',import.meta.url),'utf8');
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-24T08:00:00Z'),ts=n=>new Date(n).toISOString();
const receipt=()=>({
 observed_at:ts(NOW-1000),signature_valid:true,provider_reverified:true,
 provider_transaction_id:'tx-test-123',provider_event_key:'event-test-123',
 checkout_reference:'TFA-TEST-123',transaction_reference_matches:true,
 customer_matches:true,plan_matches:true,amount_matches:true,currency_matches:true,
 provider_status:'successful',unique_provider_transaction_claim_committed:true,
 event_dedupe_record_committed:true,atomic_fulfillment_committed:true,
 checkout_paid_committed:true,entitlement_upsert_committed:true,
 membership_status:'active',membership_checked_at:ts(NOW-1000),
 current_period_end:ts(NOW+30*86400000),legacy_replayed_payment:false,
 duplicate_transaction_extension:false
});
test('actual deployed V7 webhook has a risky three-step non-atomic fulfillment order',()=>{
 const x=inspectWebhookSource(source);
 assert.equal(x.state,'LAUNCH_HOLD');
 assert.equal(x.reason,'DURABILITY_GAP_EVENT_ACK_BEFORE_ATOMIC_ENTITLEMENT');
 assert.equal(x.checks.source_has_signature_check,true);
 assert.equal(x.checks.source_has_provider_transaction_reverify,true);
 assert.equal(x.checks.event_written_before_entitlement_commit,true);
 assert.equal(x.checks.replay_can_ack_before_entitlement_commit,true);
 assert.equal(x.signed_payment_fulfillment_certified,false);
 assert.equal(x.automatic_replay_permitted,false);
});
test('we never call source-inspection a proof of safety when incomplete or rewritten',()=>{
 assert.equal(inspectWebhookSource(null).state,'LAUNCH_HOLD');
 const stripped=source.replace("activate_subscription_from_payment",'another_rpc');
 assert.equal(inspectWebhookSource(stripped).reason,'WEBHOOK_ATOMIC_FULFILLMENT_NOT_VERIFIED');
});
test('one perfect synthetic receipt is local-only, never commerce release or mutation',()=>{
 const x=assessWebhookFulfillmentReceipt(receipt(),NOW);
 assert.equal(x.state,'LOCAL_FULFILLMENT_RECEIPT_VERIFIED_ONLY');
 assert.equal(x.receipt_fields_valid,true);
 assert.equal(x.signed_payment_fulfillment_certified,false);
 assert.equal(x.automatic_replay_permitted,false);
 assert.equal(x.commercial_launch_certified,false);
 assert.equal(x.trading,'WAIT / 0R');
});
test('no signature, no provider reverify or mismatched ownership blocks fulfillment',()=>{
 for(const field of ['signature_valid','provider_reverified',
  'transaction_reference_matches','customer_matches','plan_matches',
  'amount_matches','currency_matches']){
  const r=receipt();r[field]=false;
  assert.equal(assessWebhookFulfillmentReceipt(r,NOW).state,'LAUNCH_HOLD',field);
 }
 for(const field of ['provider_transaction_id','provider_event_key','checkout_reference']){
  const r=receipt();r[field]='';
  assert.equal(assessWebhookFulfillmentReceipt(r,NOW).state,'LAUNCH_HOLD',field);
 }
});
test('event dedupe alone without atomic entitlement or transaction-level uniqueness is not fulfillment',()=>{
 for(const field of ['unique_provider_transaction_claim_committed',
  'event_dedupe_record_committed','atomic_fulfillment_committed',
  'checkout_paid_committed','entitlement_upsert_committed']){
  const r=receipt();r[field]=false;
  assert.equal(assessWebhookFulfillmentReceipt(r,NOW).state,'LAUNCH_HOLD',field);
 }
 const old=receipt();old.duplicate_transaction_extension=true;
 assert.equal(assessWebhookFulfillmentReceipt(old,NOW).reason,'REPLAY_OR_DOUBLE_EXTENSION_RISK');
});
test('expired or missing future term, stale timestamp and legacy replay fail closed',()=>{
 const a=receipt();a.current_period_end=null;
 assert.equal(assessWebhookFulfillmentReceipt(a,NOW).reason,'CURRENT_PAID_TERM_NOT_PROVEN');
 const b=receipt();b.current_period_end=ts(NOW-1000);
 assert.equal(assessWebhookFulfillmentReceipt(b,NOW).state,'LAUNCH_HOLD');
 const c=receipt();c.legacy_replayed_payment=true;
 assert.equal(assessWebhookFulfillmentReceipt(c,NOW).state,'LAUNCH_HOLD');
 const d=receipt();d.observed_at=ts(NOW-11*60_000);
 assert.equal(assessWebhookFulfillmentReceipt(d,NOW).reason,'RECEIPT_STALE_OR_MISSING');
});
test('observed aggregate counts flag missing evidence without claiming direct transaction linkage',()=>{
 const packet={observed_at:ts(NOW-1000),total_payment_events:1,
  paid_checkout_intents:1,active_valid_terms:0,marked_active_missing_paid_terms:4};
 const r=assessAggregateReconciliation(packet,NOW);
 assert.equal(r.state,'LAUNCH_HOLD');
 assert.deepEqual(r.potential_reconciliation_gaps,
  ['PAID_INTENT_TO_VALID_TERM_NOT_LINKED','MISSING_PAID_PERIOD_END']);
 assert.equal(r.counts_are_customer_linkage_proof,false);
 assert.equal(r.automatic_replay_permitted,false);
 assert.equal(r.charge_created,false);
});
test('aggregate missing, invalid or stale evidence never passes',()=>{
 for(const val of [null,-1,1.2,'1',NaN]){
  const r=assessAggregateReconciliation({observed_at:ts(NOW-2000),
   total_payment_events:val,paid_checkout_intents:1,
   active_valid_terms:0,marked_active_missing_paid_terms:4},NOW);
  assert.equal(r.state,'LAUNCH_HOLD');
 }
 const stale=assessAggregateReconciliation({
  observed_at:ts(NOW-11*60_000),total_payment_events:1,
  paid_checkout_intents:1,active_valid_terms:0,marked_active_missing_paid_terms:4
 },NOW);
 assert.equal(stale.reason,'AGGREGATE_OUTDATED_OR_MISSING');
});
test('this package never reaches the provider or sends DB writes, and checkout remains blocked',()=>{
 const files=['src/v274-webhook-fulfillment-audit.mjs',
  'scripts/v274-audit-webhook-ledger.mjs'].map(read).join('\n');
 assert.doesNotMatch(files,/\bfetch\s*\(|Deno\.serve|createClient|insert\(|update\(|activate_subscription_from_payment|window\.location/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('docs/operations/2026-10-24-v274-payment-fulfillment-gap.md'),/Do not deploy an unverified webhook replacement/);
});
