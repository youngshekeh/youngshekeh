// V234 public read-only references. No Supabase, tokens, user-selected URL or execution path.
export const GOLD_MAX_AGE_MS=120000;
export const GOLD_FUTURE_SKEW_MS=5000;
export const WAIT_GOVERNANCE=Object.freeze({
  action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,
  machine_execution_allowed:false,market_data_only:true
});
const number=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
export function curateGoldReference(payload,now=Date.now()){
  if(payload?.symbol!=='XAU'||payload?.currency!=='USD')return null;
  const price=number(payload.price),stamp=Date.parse(String(payload.updatedAt||''));
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(stamp)
    ||stamp>now+GOLD_FUTURE_SKEW_MS||now-stamp>GOLD_MAX_AGE_MS)return null;
  return Object.freeze({symbol:'XAUUSD',name:'Gold spot',price,currency:'USD',unit:'troy oz',
    type:'INDICATIVE_SPOT',source:'Gold API',source_url:'https://gold-api.com/docs',
    source_updated_at:new Date(stamp).toISOString(),observed_at:new Date(stamp).toISOString(),
    age_seconds:Math.max(0,Math.floor((now-stamp)/1000)),broker_verified:false,
    execution_quote:false});
}
export function curateBitcoinReference(payload,receivedAt=Date.now()){
  const d=payload?.data;
  const price=number(d?.amount);
  if(d?.base!=='BTC'||d?.currency!=='USD'||!Number.isFinite(price)||price<=0
    ||!Number.isFinite(receivedAt))return null;
  return Object.freeze({symbol:'BTCUSD',name:'Bitcoin spot',price,currency:'USD',unit:'BTC',
    type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',
    source_url:'https://developers.coinbase.com',source_updated_at:null,
    observed_at:new Date(receivedAt).toISOString(),age_seconds:null,
    broker_verified:false,execution_quote:false});
}
export function curatePublicReferences({gold=null,bitcoin=null}={},receivedAt=Date.now()){
 const available=Number(Boolean(gold))+Number(Boolean(bitcoin));
 return Object.freeze({ok:available>0,version:'v234-independent-public-market-reference-v1',
   state:available===2?'REFERENCES_AVAILABLE':available===1?'PARTIAL_REFERENCES':'UNAVAILABLE',
   generated_at:new Date(receivedAt).toISOString(),independent_of_private_kernel:true,
   reference_only:true,not_for_trade_execution:true,
   assets:{gold,bitcoin},sources_verified:available,expected_sources:2,
   governance:WAIT_GOVERNANCE});
}
