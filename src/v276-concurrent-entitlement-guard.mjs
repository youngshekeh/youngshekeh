// V276 pure prospective conflict policy model; NOT database execution or authorization.
const stamp=v=>{const x=Date.parse(String(v??''));return Number.isFinite(x)?x:null};
export function evaluateConcurrentEntitlementConflict(existing={},incoming={},now=Date.now()){
 const expired=stamp(incoming.period_end);
 const current=stamp(existing.current_period_end);
 const transactionOk=typeof incoming.transaction_id==='string'
  && /^[A-Za-z0-9_-]{1,128}$/.test(incoming.transaction_id);
 const amountOk=typeof incoming.amount==='number'
  && Number.isFinite(incoming.amount)&&incoming.amount>0&&incoming.currency==='USD';
 const termOk=expired!==null&&expired>now&&expired<=now+65*86400_000;
 const providerOk=(existing.provider==null||existing.provider==='flutterwave');
 const customerOk=(existing.customer_id==null||existing.customer_id===incoming.customer_id);
 const subscriptionOk=(existing.subscription_id==null||existing.subscription_id===incoming.subscription_id);
 const monotonic=current===null||expired!==null&&expired>current;
 const accepted=transactionOk&&amountOk&&termOk
  &&providerOk&&customerOk&&subscriptionOk&&monotonic;
 return Object.freeze({
  policy:'V276_CONFLICT_TIME_GUARD',
  verdict:accepted?'CANDIDATE_CONFLICT_PREDICATE_ALLOWS':'MANUAL_RECONCILIATION_REQUIRED',
  checks:Object.freeze({transactionOk,amountOk,termOk,providerOk,customerOk,subscriptionOk,monotonic}),
  actual_database_execution:false,paid_period_changed:false,
  new_charge_created:false,payment_acknowledged:false,commerce_unlocked:false
 });
}
