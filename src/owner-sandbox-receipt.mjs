const FIELDS=new Set(['mode','asset','provenance','source_code','provider_symbol','sequence','observed_at','event_type','client_order_id','broker_order_id','side','requested_r','requested_price','fill_price','bid','ask','kill_switch_state']);
const MSG={
 owner_mfa_required:'Verify owner access and MFA before submitting a sandbox receipt.',busy:'A sandbox receipt is already being submitted.',
 invalid_json:'Paste one JSON receipt object from the demo broker.',body_too_large:'The receipt must be smaller than 32 KB.',
 unexpected_fields:'Remove extra fields. Never paste passwords, API keys, access tokens or broker credentials.',
 sandbox_boundary_required:'Use BROKER_DEMO_SANDBOX, XAUUSD and DEMO_BROKER_USER_SUPPLIED.',
 invalid_source_or_symbol:'Use a safe source code and an XAUUSD provider symbol.',invalid_sequence:'Sequence must be a positive safe integer.',
 invalid_timestamp:'Use a recent ISO timestamp with an explicit timezone.',future_receipt:'The receipt timestamp is in the future.',
 stale_receipt:'The receipt is at least 30 seconds old. Obtain a new sandbox event instead of editing the timestamp.',
 invalid_event_type:'Use QUOTE, ORDER_ACK, FILL, CANCEL_ACK or KILL_SWITCH_ACK.',invalid_bid_ask:'Quote bid/ask values are invalid.',
 invalid_order_fields:'Order identifiers, side, requested R or requested price are invalid.',invalid_fill:'Fill price is invalid.',
 field_mismatch:'Fields do not match this receipt type.',invalid_kill_switch_receipt:'Kill-switch receipts must only acknowledge ENGAGED state.',
 invalid_session:'The owner session is invalid or expired.',aal2_required:'Verify MFA again.',owner_only:'This is not an active owner session.',
 conflicting_replay:'That source sequence already contains a different receipt.',out_of_order_receipt:'Receipt sequence or timestamp is older than the latest accepted event.',
 sandbox_receipt_rejected:'The server rejected this sandbox receipt.',session_changed:'Owner session changed during submission.',
 unverified_receipt:'No valid sandbox intake receipt was confirmed.',transport_unavailable:'No sandbox receipt was confirmed. Refresh status before retrying.'
};
export const sandboxReceiptMessage=e=>MSG[e]||'Sandbox receipt intake is unavailable. No production trading permission changed.';
const fail=e=>({ok:false,error:e,message:sandboxReceiptMessage(e)});
const ID=/^[A-Za-z0-9._:-]{1,96}$/;
const TS=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export function prepareSandboxReceipt(text,now=Date.now()){
 if(typeof text!=='string')return fail('invalid_json');
 if(new TextEncoder().encode(text).length>32768)return fail('body_too_large');
 let q;try{q=JSON.parse(text);}catch{return fail('invalid_json');}
 if(!q||typeof q!=='object'||Array.isArray(q))return fail('invalid_json');
 if(Object.keys(q).some(k=>!FIELDS.has(k)))return fail('unexpected_fields');
 if(q.mode!=='BROKER_DEMO_SANDBOX'||q.asset!=='XAUUSD'||q.provenance!=='DEMO_BROKER_USER_SUPPLIED')return fail('sandbox_boundary_required');
 if(typeof q.source_code!=='string'||!/^[A-Z0-9_-]{3,64}$/.test(q.source_code)||typeof q.provider_symbol!=='string'||!/^XAUUSD[A-Za-z0-9._-]{0,16}$/.test(q.provider_symbol))return fail('invalid_source_or_symbol');
 if(!Number.isSafeInteger(q.sequence)||q.sequence<=0)return fail('invalid_sequence');
 if(typeof q.observed_at!=='string'||!TS.test(q.observed_at)||!Number.isFinite(Date.parse(q.observed_at))||!Number.isFinite(now))return fail('invalid_timestamp');
 const age=now-Date.parse(q.observed_at);if(age<0)return fail('future_receipt');if(age>=30000)return fail('stale_receipt');
 if(!['QUOTE','ORDER_ACK','FILL','CANCEL_ACK','KILL_SWITCH_ACK'].includes(q.event_type))return fail('invalid_event_type');
 const base={mode:'BROKER_DEMO_SANDBOX',asset:'XAUUSD',provenance:'DEMO_BROKER_USER_SUPPLIED',source_code:q.source_code,provider_symbol:q.provider_symbol,sequence:q.sequence,observed_at:q.observed_at,event_type:q.event_type};
 if(q.event_type==='QUOTE'){
   if(typeof q.bid!=='number'||typeof q.ask!=='number'||!Number.isFinite(q.bid)||!Number.isFinite(q.ask)||q.bid<=0||q.ask<=q.bid||q.ask-q.bid>q.bid*.02)return fail('invalid_bid_ask');
   if(['client_order_id','broker_order_id','side','requested_r','requested_price','fill_price','kill_switch_state'].some(k=>k in q))return fail('field_mismatch');
   return{ok:true,receipt:{...base,bid:q.bid,ask:q.ask}};
 }
 if(q.event_type==='KILL_SWITCH_ACK'){
   if(q.kill_switch_state!=='ENGAGED'||['client_order_id','broker_order_id','side','requested_r','requested_price','fill_price','bid','ask'].some(k=>k in q))return fail('invalid_kill_switch_receipt');
   return{ok:true,receipt:{...base,kill_switch_state:'ENGAGED'}};
 }
 if(typeof q.client_order_id!=='string'||!ID.test(q.client_order_id)||typeof q.broker_order_id!=='string'||!ID.test(q.broker_order_id)||!['LONG','SHORT'].includes(q.side)
   ||typeof q.requested_r!=='number'||!Number.isFinite(q.requested_r)||q.requested_r<=0||q.requested_r>1
   ||typeof q.requested_price!=='number'||!Number.isFinite(q.requested_price)||q.requested_price<=0)return fail('invalid_order_fields');
 if('bid'in q||'ask'in q||'kill_switch_state'in q)return fail('field_mismatch');
 const order={...base,client_order_id:q.client_order_id,broker_order_id:q.broker_order_id,side:q.side,requested_r:q.requested_r,requested_price:q.requested_price};
 if(q.event_type==='FILL'){
   if(typeof q.fill_price!=='number'||!Number.isFinite(q.fill_price)||q.fill_price<=0)return fail('invalid_fill');
   return{ok:true,receipt:{...order,fill_price:q.fill_price}};
 }
 if('fill_price'in q)return fail('field_mismatch');
 return{ok:true,receipt:order};
}
export function createSandboxReceiptSubmitter({getSession,send,now=Date.now}){
 let busy=false;
 return{async submit(text){
   const session=getSession();if(!session?.token||session.owner!==true||session.mfa!==true)return fail('owner_mfa_required');
   if(busy)return fail('busy');
   const draft=prepareSandboxReceipt(text,now());if(!draft.ok)return draft;
   busy=true;
   try{
     const response=await send(draft.receipt);const current=getSession();
     if(current?.token!==session.token||current?.owner!==true||current?.mfa!==true)return fail('session_changed');
     if(response?.ok!==true)return fail(response?.error||'unverified_receipt');
     if(response.sandbox_only!==true||response.capital_permission!=='0R'||response.execution_grade!==false||response.production_broker_verified!==false
       ||response.live_order_submission_enabled!==false||response.governance?.action_permitted!=='WAIT'||response.governance?.capital_permission!=='0R'
       ||response.governance?.live_order_submission_enabled!==false||response.governance?.production_broker_verified!==false
       ||response.governance?.sandbox_evidence_can_unlock_capital!==false||!Number.isSafeInteger(response.receipt_id)||response.receipt_id<=0
       ||!(response.state==='SANDBOX_RECEIPT_RECORDED'&&response.inserted===true||response.state==='DUPLICATE_ALREADY_RECORDED'&&response.inserted===false))return fail('unverified_receipt');
     return{ok:true,receipt_id:response.receipt_id,inserted:response.inserted,event_type:draft.receipt.event_type,certification:response.certification};
   }catch(error){return fail(error?.data?.error||'transport_unavailable');}
   finally{busy=false;}
 }};
}
