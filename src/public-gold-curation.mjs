// V228: independent fixed-source XAUUSD read, no caller-chosen URL or query.
// Broker quotes and indicative spot data are never confused.
import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';
export const MAX_INDICATIVE_AGE_MS=15*60_000;
export function curatePublicGold({broker,reference}={},now=Date.now()){
 const wait=Object.freeze({action_permitted:'WAIT',capital_permission:'0R',
   machine_execution_allowed:false,live_order_submission_enabled:false,market_data_only:true});
 const source=broker?.data;
 const live=verifyPublicGoldQuote({response:{ok:broker?.httpOk===true},data:source},now);
 if(live.verified){
   const q=source.live_broker.quote;
   return Object.freeze({ok:true,market_status:'BROKER_LIVE',price_class:'BROKER_LIVE_READ_ONLY',
     live_broker:source.live_broker,
     feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:q.mid,bid:q.bid,ask:q.ask,
       market_time:q.observed_at,quote_type:'broker_live_read_only',source:'Authenticated MT5 broker terminal'}},
     source:'public-gold-live-xauusd',observed_at:q.observed_at,governance:wait});
 }
 // Do not pass through a stale/falsely live claim from an upstream provider.
 const candidates=[
   broker?.httpOk===true&&source?.ok===true?source.feed?.gold_spot:null,
   reference?.httpOk===true&&reference?.data?.ok===true?reference.data.feed?.gold_spot:null
 ];
 const spot=candidates.find(item=>{
   const price=item?.price,age=Date.parse(String(item?.market_time||''));
   return item?.symbol==='XAUUSD'&&item?.currency==='USD'
     &&item?.quote_type==='spot_indicative'
     &&typeof price==='number'&&Number.isFinite(price)&&price>0
     &&Number.isFinite(age)&&age<=now+1000&&now-age<=MAX_INDICATIVE_AGE_MS;
 });
 if(spot){
   return Object.freeze({ok:true,market_status:'INDICATIVE_RESEARCH',
     price_class:'INDICATIVE_SPOT_NOT_EXECUTABLE',
     live_broker:{state:'NOT_VERIFIED'},
     feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:spot.price,
       market_time:spot.market_time,quote_type:'spot_indicative',source:String(spot.source||'Public research feed').slice(0,100)}},
     source:'PUBLIC_SPOT_REFERENCE',observed_at:spot.market_time,governance:wait});
 }
 return Object.freeze({ok:false,state:'UNAVAILABLE',market_status:'UNAVAILABLE',price_class:'WITHHELD',
   error:'no_fresh_attributed_gold_quote',live_broker:{state:'NOT_VERIFIED'},feed:{},governance:wait});
}
