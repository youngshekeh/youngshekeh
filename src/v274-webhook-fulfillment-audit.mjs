// V274: OFFLINE, evidence-only webhook fulfillment integrity. Never modifies a payment.
export const WEBHOOK_AUDIT_VERSION='v274-webhook-fulfillment-audit-v1';
const timestamp=value=>{const n=Date.parse(String(value??''));return Number.isFinite(n)?n:null};
const fresh=(value,now)=>{const n=timestamp(value);return n!==null&&n<=now+60_000&&now-n>=0&&now-n<=10*60_000};
const nonEmpty=value=>typeof value==='string'&&value.length>0&&value.length<=128;
const deny=(reason,source={})=>Object.freeze({
 version:WEBHOOK_AUDIT_VERSION,state:'LAUNCH_HOLD',reason,
 signed_payment_fulfillment_certified:false,automatic_replay_permitted:false,
 customer_entitlement_modified:false,charge_created:false,commercial_launch_certified:false,
 checks:Object.freeze(source),trading:'WAIT / 0R'
});
// Legacy source inspection is a risk detector, not an attestation that a new version is deployed.
export function inspectWebhookSource(source){
 if(typeof source!=='string'||source.length<500)return deny('WEBHOOK_SOURCE_MISSING');
 const event=source.lastIndexOf('const inserted=await addEvent(');
 const payment=source.lastIndexOf("await patch(base,key,'checkout_intents'");
 const rpc=source.lastIndexOf('activate_subscription_from_payment');
 const replay=source.indexOf("if(Array.isArray(inserted)&&inserted.length===0)return new Response('ok'",event);
 const signature=source.includes('hmacBase64(raw,secretHash)')&&source.includes("safeEq(hmacSig,expected)");
 const providerReverify=source.includes('api.flutterwave.com/v3/transactions/');
 const dangerousOrder=event>=0&&payment>event&&rpc>payment;
 const prematureAck=replay>event&&replay<rpc;
 return deny(dangerousOrder&&prematureAck
  ?'DURABILITY_GAP_EVENT_ACK_BEFORE_ATOMIC_ENTITLEMENT'
  :'WEBHOOK_ATOMIC_FULFILLMENT_NOT_VERIFIED',{
  source_has_signature_check:signature,
  source_has_provider_transaction_reverify:providerReverify,
  event_written_before_entitlement_commit:dangerousOrder,
  replay_can_ack_before_entitlement_commit:prematureAck,
  source_enforces_transaction_unique_atomic_commit:false
 });
}
export function assessWebhookFulfillmentReceipt(receipt={},now=Date.now()){
 if(!fresh(receipt.observed_at,now))return deny('RECEIPT_STALE_OR_MISSING');
 if(receipt.signature_valid!==true||receipt.provider_reverified!==true)
  return deny('SIGNED_PROVIDER_REVERIFICATION_REQUIRED');
 if(!nonEmpty(receipt.provider_transaction_id)||!nonEmpty(receipt.provider_event_key)
  ||!nonEmpty(receipt.checkout_reference))
  return deny('IMMUTABLE_PROVIDER_IDENTITY_MISSING');
 if(receipt.transaction_reference_matches!==true
  ||receipt.customer_matches!==true||receipt.plan_matches!==true
  ||receipt.amount_matches!==true||receipt.currency_matches!==true
  ||receipt.provider_status!=='successful')
  return deny('PROVIDER_OR_CUSTOMER_PARITY_NOT_VERIFIED');
 if(receipt.legacy_replayed_payment===true
   ||receipt.duplicate_transaction_extension===true)
  return deny('REPLAY_OR_DOUBLE_EXTENSION_RISK');
 if(receipt.unique_provider_transaction_claim_committed!==true
  ||receipt.event_dedupe_record_committed!==true)
  return deny('TRANSACTION_DEDUPE_NOT_COMMITTED');
 if(receipt.atomic_fulfillment_committed!==true
  ||receipt.checkout_paid_committed!==true
  ||receipt.entitlement_upsert_committed!==true)
  return deny('ATOMIC_PAYMENT_ENTITLEMENT_COMMIT_NOT_PROVEN');
 if(receipt.membership_status!=='active'
   ||!fresh(receipt.membership_checked_at,now)
   ||timestamp(receipt.current_period_end)===null
   ||timestamp(receipt.current_period_end)<=now)
  return deny('CURRENT_PAID_TERM_NOT_PROVEN');
 return Object.freeze({
  version:WEBHOOK_AUDIT_VERSION,
  state:'LOCAL_FULFILLMENT_RECEIPT_VERIFIED_ONLY',
  reason:'NEEDS_LIVE_PROVIDER_AND_OPERATOR_RELEASE',
  signed_payment_fulfillment_certified:false,
  receipt_fields_valid:true,automatic_replay_permitted:false,
  customer_entitlement_modified:false,charge_created:false,
  commercial_launch_certified:false,trading:'WAIT / 0R'
 });
}
export function assessAggregateReconciliation(data={},now=Date.now()){
 if(!fresh(data.observed_at,now))return deny('AGGREGATE_OUTDATED_OR_MISSING');
 const fields=['total_payment_events','paid_checkout_intents','active_valid_terms','marked_active_missing_paid_terms'];
 if(!fields.every(f=>Number.isSafeInteger(data[f])&&data[f]>=0))
  return deny('AGGREGATE_COUNTS_INVALID');
 const gaps=[];
 if(data.paid_checkout_intents>data.active_valid_terms)
  gaps.push('PAID_INTENT_TO_VALID_TERM_NOT_LINKED');
 if(data.marked_active_missing_paid_terms>0)gaps.push('MISSING_PAID_PERIOD_END');
 if(data.total_payment_events<data.paid_checkout_intents)gaps.push('PAYMENT_EVENT_INTENT_COUNT_DIFFERENCE');
 return Object.freeze({
  version:WEBHOOK_AUDIT_VERSION,state:'LAUNCH_HOLD',
  reason:'TRANSACTION_LINKAGE_REQUIRED',
  // Not per-customer matches; these aggregate counts cannot establish a lost entitlement.
  potential_reconciliation_gaps:Object.freeze(gaps),
  counts_are_customer_linkage_proof:false,
  signed_payment_fulfillment_certified:false,
  automatic_replay_permitted:false,customer_entitlement_modified:false,
  charge_created:false,commercial_launch_certified:false,trading:'WAIT / 0R'
 });
}
