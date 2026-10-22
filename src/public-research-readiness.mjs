import {verifiedPublicReferences} from './v235-reference-integrity.mjs';

// Public research availability must never be confused with broker execution,
// private automation certification, paid checkout or account entitlement.
export function assessPublicResearchAvailability({pageServed=false,reference}={},now=Date.now()){
 const verified=reference?.response?.ok===true
  ?verifiedPublicReferences(reference?.data,now)
  :{gold:null,bitcoin:null,count:0};
 const count=verified.count;
 return Object.freeze({
  page_state:pageServed===true?'PAGE DELIVERED':'NOT VERIFIED',
  page_delivered:pageServed===true,
  reference_state:count===2?'TWO CURRENT SOURCES':count===1?'ONE CURRENT SOURCE':'NO CURRENT SOURCES',
  verified_references:count,
  gold_reference_current:Boolean(verified.gold),
  bitcoin_reference_current:Boolean(verified.bitcoin),
  research_reference_available:count>0,
  commercial_checkout_certified:false,
  private_kernel_certified:false,
  execution_quote_verified:false,
  trading_permission:'WAIT',capital_permission:'0R'
 });
}
