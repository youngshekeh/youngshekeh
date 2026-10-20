// V221 read-only entitlement evidence verifier. This is not a payment or webhook processor.
// Source inputs are operator-collected aggregate receipts; no PII, references or tokens.
export const LEDGER_AUDIT_VERSION='v221-readonly-entitlement-audit-v1';
const AGE_MS=10*60*1000;
const numberOf=x=>Number.isSafeInteger(x)&&x>=0;
const parse=x=>{const n=Date.parse(String(x??''));return Number.isFinite(n)?n:null};
const fresh=(x,now)=>{const n=parse(x);return n!==null&&n<=now+60000&&now-n<=AGE_MS};
const fields=['successful_signed_events','paid_checkout_intents','matched_paid_checkouts',
 'matching_active_entitlements','matching_past_due_entitlements',
 'unmatched_signed_payment_events','active_memberships','past_due_memberships'];
function fail(reason,now){
 return Object.freeze({version:LEDGER_AUDIT_VERSION,at:new Date(now).toISOString(),
 state:'LAUNCH_HOLD',reason,eligible_for_live_checkout:false,may_reactivate_historical_payment:false,
 real_orders:false,unlocked_entitlements:0});
}
export function evaluateEntitlementEvidence(input={},now=Date.now()){
 if(!fresh(input.observed_at,now))return fail('STALE_OR_ABSENT_OPERATOR_EVIDENCE',now);
 if(!fields.every(f=>numberOf(input[f])))return fail('INCOMPLETE_LEDGER_COUNTS',now);
 if(input.matched_paid_checkouts>input.successful_signed_events
 ||input.matched_paid_checkouts>input.paid_checkout_intents
 ||input.matching_active_entitlements+input.matching_past_due_entitlements>input.successful_signed_events
 ||input.matching_active_entitlements>input.active_memberships)
   return fail('INCONSISTENT_LEDGER_COUNTS',now);
 const lastPayment=parse(input.latest_signed_payment_at);
 const lastTermEnd=parse(input.latest_membership_period_end);
 if(input.matching_active_entitlements===0){
  const hasExpiredHistory=input.matching_past_due_entitlements>0
    &&lastTermEnd!==null&&lastTermEnd<=now
    &&lastPayment!==null&&lastPayment<=lastTermEnd;
  return fail(hasExpiredHistory?'HISTORICAL_TERM_EXPIRED':'CURRENT_ENTITLEMENT_NOT_PROVEN',now);
 }
 // Aggregate rows alone cannot assert that a specific *new* transaction was
 // signed, rechecked with the provider, atomically fulfilled and still active.
 // Controlled acceptance uses an independent per-transaction verified receipt.
 return fail('LINKED_TRANSACTION_PROOF_REQUIRED',now);
}
export function certifyFulfillmentReceipt(receipt={},now=Date.now()){
 const failReceipt=reason=>Object.freeze({
  version:LEDGER_AUDIT_VERSION,state:'NOT_CERTIFIED',reason,
  paid_charge_created:false,entitlement_mutated:false,checkout_unlocked:false
 });
 if(!fresh(receipt.observed_at,now))return failReceipt('RECEIPT_NOT_FRESH');
 if(receipt.signature_valid!==true||receipt.provider_reverified!==true)
   return failReceipt('SIGNED_PROVIDER_VERIFICATION_REQUIRED');
 if(receipt.transaction_reference_matches!==true
    ||receipt.customer_matches!==true||receipt.plan_matches!==true
    ||receipt.currency_matches!==true||receipt.amount_matches!==true
    ||receipt.provider_status!=='successful')
   return failReceipt('PAYMENT_IDENTITY_OR_AMOUNT_MISMATCH');
 if(receipt.atomic_fulfillment_committed!==true
    ||receipt.event_dedupe_record_committed!==true
    ||receipt.entitlement_upsert_committed!==true
    ||receipt.checkout_paid_committed!==true)
   return failReceipt('FULFILLMENT_TRANSACTION_NOT_COMMITTED');
 if(receipt.membership_status!=='active'
    ||!fresh(receipt.membership_checked_at,now)
    ||!(parse(receipt.current_period_end)>now))
   return failReceipt('ACTIVE_TERM_NOT_CONFIRMED');
 if(receipt.legacy_historical_replay===true||receipt.event_is_expired===true)
   return failReceipt('STALE_OR_REPLAYED_PAYMENT');
 // This is a local evidence verdict only. It cannot authorize a charge or
 // activate a subscription. Full product launch has independent additional gates.
 return Object.freeze({version:LEDGER_AUDIT_VERSION,state:'FULFILLMENT_RECEIPT_VERIFIED',
  reason:'SIGNED_IDEMPOTENT_ACTIVE_TERM',paid_charge_created:false,
  entitlement_mutated:false,checkout_unlocked:false});
}
export function describeAudit(result){
 const reasons=new Set([
  'STALE_OR_ABSENT_OPERATOR_EVIDENCE','INCOMPLETE_LEDGER_COUNTS',
  'INCONSISTENT_LEDGER_COUNTS','HISTORICAL_TERM_EXPIRED',
  'CURRENT_ENTITLEMENT_NOT_PROVEN','LINKED_TRANSACTION_PROOF_REQUIRED'
 ]);
 const reason=reasons.has(result?.reason)?result.reason:'EVIDENCE_NOT_CERTIFIED';
 return [
  'THE FATHER ANALYTICS | V221 Billing Entitlement Audit',
  'Status: LAUNCH HOLD','Reason: '+reason,
  'This snapshot is read-only. It does not update subscriptions, refund money,',
  'contact a customer, retry a provider webhook or generate a checkout URL.',
  'Historical successful payments do not authorize extending an expired subscription.',
  'Require a fresh signed Flutterwave event, provider transaction verification,',
  'matching customer, plan, amount, currency and reference, and a durable',
  'atomic event+checkout+entitlement transaction receipt before the next paid release.',
  'Existing payment checkout guards and real-money trading WAIT / 0R remain locked.'
 ].join('\n');
}
