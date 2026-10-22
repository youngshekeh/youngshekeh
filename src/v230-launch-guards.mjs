// V230: Pure, read-only launch guards. No execution, payment, or scheduling code.
import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';

export const V230_GOVERNANCE=Object.freeze({
  action_permitted:'WAIT',capital_permission:'0R',
  machine_execution_allowed:false,live_order_submission_enabled:false
});
export function positiveMarketPrice(value){
  if(value===null||value===undefined||typeof value==='boolean'||Array.isArray(value))return null;
  if(typeof value==='string'&&!value.trim())return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>0?n:null;
}
export function normalizeReadOnlyGoldUpstream(status,body){
  if(status===200&&body!==null&&typeof body==='object'&&!Array.isArray(body)&&body.ok===true)
    return {status:200,body};
  return {status:503,body:{ok:false,state:'UNAVAILABLE',error:'live_xauusd_unavailable',
    governance:{...V230_GOVERNANCE}}};
}
export function evaluateV230LaunchProof({qa=null,gold=null,paper=null,billing=null,
  checkoutServerGuardDeployed=false,now=Date.now()}={}){
  const tests=Number(qa?.total);
  const qaVerified=qa?.state==='PASS'&&Number.isInteger(tests)&&tests>=107&&qa?.failed===0&&qa?.passed===tests;
  const goldProof=verifyPublicGoldQuote({response:{ok:gold?.http_ok===true},data:gold?.body??null},now);
  // Paper evidence must be receipts from the actual sandbox adapter, not shadow intents.
  const paperVerified=paper?.mode==='PAPER_ONLY'&&paper?.broker_verified===true
    &&paper?.real_money===false&&Number.isInteger(paper?.verified_quotes)&&paper.verified_quotes>0
    &&Number.isInteger(paper?.verified_receipts)&&paper.verified_receipts>0;
  const commerceVerified=checkoutServerGuardDeployed===true&&billing?.webhook_verified===true
    &&billing?.entitlement_verified===true&&billing?.pricing_verified===true
    &&billing?.manual_payment_confirmation===true;
  const gates={autonomous_qa:qaVerified,gold_broker_read_only:goldProof.verified,
    paper_broker_evidence:paperVerified,commercial_checkout:commerceVerified};
  const blockers=Object.entries(gates).filter(([,v])=>!v).map(([k])=>k);
  return {version:'v230-launch-proof-v1',ready:blockers.length===0,gates,blockers,
    gold_quote_reason:goldProof.reason,governance:{...V230_GOVERNANCE,
      broker_quote_cannot_enable_trading:true,paper_receipts_cannot_enable_live_trading:true,
      server_charge_guard_required:true,human_release_required:true}};
}
