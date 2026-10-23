import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';
export const DISPLAY_REFERENCE_MAX_AGE_MS=120000;
export function goldDisplay(body,now=Date.now()){
 const missing={mode:'UNAVAILABLE',price:null,source:null,age_seconds:null,expires_at:null};
 if(body?.ok!==true||body?.governance?.capital_permission!=='0R'||body?.governance?.live_order_submission_enabled!==false)return missing;
 if(verifyPublicGoldQuote({response:{ok:true},data:body},now).verified){
  const q=body.live_broker.quote,at=Date.parse(q.observed_at);
  return {mode:'BROKER_LIVE_READ_ONLY',price:q.mid,source:'Authenticated MT5 broker terminal',age_seconds:Math.max(q.age_seconds,(now-at)/1000),expires_at:new Date(at+5000).toISOString()};
 }
 const p=body.feed?.gold_spot,at=Date.parse(p?.market_time);
 if(p?.symbol!=='XAUUSD'||p?.currency!=='USD'||p?.quote_type!=='spot_indicative'||typeof p.price!=='number'||!Number.isFinite(p.price)||p.price<=0||typeof p.source!=='string'||!p.source.trim()||!Number.isFinite(at)||at>now+1000||now-at>DISPLAY_REFERENCE_MAX_AGE_MS)return missing;
 return {mode:'INDICATIVE_REFERENCE',price:p.price,source:p.source.slice(0,100),age_seconds:Math.max(0,(now-at)/1000),expires_at:new Date(at+DISPLAY_REFERENCE_MAX_AGE_MS).toISOString()};
}
