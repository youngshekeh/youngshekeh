// V275 prospective acceptance. Pure checks only; never authorizes a charge.
export function assessAtomicFulfillmentCandidate(e={},now=Date.now()){
 const parse=x=>{const n=Date.parse(String(x??''));return Number.isFinite(n)?n:null};
 const verified=parse(e.verified_at),term=parse(e.period_end);
 const checks=Object.freeze({
  provider_verified:e.signature_valid===true&&e.provider_reverified===true
   &&e.provider_status==='successful',
  transaction_parity:e.user_matches===true&&e.plan_matches===true
   &&e.reference_matches===true&&e.amount_matches===true
   &&e.currency==='USD',
  receipt_fresh:verified!==null&&verified<=now+60_000&&now-verified<=600_000,
  term_proven:term!==null&&term>now&&term<=now+65*86_400_000,
  atomic_commit:e.event_checkout_entitlement_atomic===true,
  provider_tx_unique:e.unique_transaction_id===true,
  replay_safe:e.duplicate_transaction_noop===true
   &&e.legacy_partial_requires_review===true,
  restricted_role:e.service_role_only===true,
  operational_acceptance:e.db_stable===true&&e.sandbox_tests_passed===true
   &&e.operator_approved===true
 });
 return Object.freeze({version:'v275-atomic-fulfillment-candidate-v1',
  state:'DESIGN_HOLD',checks,
  missing:Object.freeze(Object.entries(checks).filter(([,v])=>!v).map(([k])=>k)),
  production_rpc_deployed:false,live_webhook_changed:false,
  payment_processing_enabled:false,customer_records_changed:false,
  commercial_launch_certified:false,trading:'WAIT / 0R'});
}
