// V255: independent browser-side cadence and strict public research admission.
// Neither this module nor any of its callers may grant trading or paid access.
import {verifyQuarterlyPacket} from './quarterly-liquidity-core.mjs';
import {verifiedPublicReferences} from './v235-reference-integrity.mjs';
import {verifyMacroPacket} from './public-macro-reference-data.mjs';

export const MARKET_FEED_PLAN=Object.freeze({
 quarterly:Object.freeze({url:'/api/public-quarterly-zones',intervalMs:300000,maxRequestMs:9500,
  label:'Historical quarterly ranges',description:'completed-quarter OHLC · 5-minute refresh'}),
 spot:Object.freeze({url:'/api/public-market-reference',intervalMs:15000,maxRequestMs:7000,
  label:'Gold / Bitcoin spot references',description:'BTC receipt · 15-second refresh'}),
 macro:Object.freeze({url:'/api/public-macro-reference',intervalMs:30000,maxRequestMs:7000,
  label:'Oil / Dollar Index references',description:'delayed vendor market time · 30-second refresh'})
});
export const MARKET_RENDER_INTERVAL_MS=15000;

export function validateMarketFeed(kind,packet,now=Date.now()){
 if(!Object.prototype.hasOwnProperty.call(MARKET_FEED_PLAN,kind))throw Error('invalid_feed_kind');
 if(!packet||packet.ok!==true||packet.reference_only!==true
  ||packet.not_for_trade_execution!==true
  ||packet.governance?.capital_permission!=='0R'
  ||packet.governance?.live_order_submission_enabled!==false)return null;
 const count=kind==='quarterly'?Object.keys(verifyQuarterlyPacket(packet,now)).length:
  kind==='spot'?verifiedPublicReferences(packet,now).count:
  verifyMacroPacket(packet,now).count;
 return count>0?Object.freeze({packet,count}):null;
}
export async function readMarketFeed(kind,{read,now=Date.now}={}){
 const plan=MARKET_FEED_PLAN[kind];
 if(!plan||typeof read!=='function')throw Error('invalid_market_feed_request');
 try{
  // Caller provides a fixed URL and cancellation signal; no dynamic origin,
  // credentials, private authentication or source mirroring.
  const payload=await read(plan.url,plan.maxRequestMs);
  return validateMarketFeed(kind,payload,now());
 }catch{return null}
}
export function marketStreamSummary(kind,packet,now=Date.now()){
 const plan=MARKET_FEED_PLAN[kind];
 if(!plan)throw Error('invalid_feed_kind');
 const accepted=validateMarketFeed(kind,packet,now);
 const expected=kind==='quarterly'?9:2;
 const state=accepted?
  accepted.count===expected?'VERIFIED RESEARCH':'PARTIAL RESEARCH':
  'SOURCE UNAVAILABLE';
 return Object.freeze({kind,state,count:accepted?.count||0,expected,
  interval_ms:plan.intervalMs,
  trade_permission:'WAIT',capital_permission:'0R',
  credentialed_broker_quote:false,commercial_market_data_license_verified:false});
}
