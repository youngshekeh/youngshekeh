import {curateGoldReference} from './public-market-reference-data.mjs';
import {curatePublicGold} from './public-gold-curation.mjs';
import {goldDisplay} from './public-gold-display.mjs';
export function composeGoldRead(governed,independent,now=Date.now()){
 if(goldDisplay(governed,now).mode==='BROKER_LIVE_READ_ONLY')return governed;
 const quote=curateGoldReference(independent,now);
 if(quote&&Date.parse(quote.source_updated_at)<=now+1000){
  const body=curatePublicGold({reference:{httpOk:true,data:{ok:true,feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:quote.price,market_time:quote.source_updated_at,quote_type:'spot_indicative',source:quote.source}}}}},now);
  return {...body,data_lane:'INDEPENDENT_PUBLIC_REFERENCE',broker_status:'NOT_VERIFIED',source_updated_at:quote.source_updated_at};
 }
 if(goldDisplay(governed,now).mode==='INDICATIVE_REFERENCE')return governed;
 return curatePublicGold({},now);
}
export async function readIndependentGold(fetcher=fetch){
 try{const r=await fetcher('https://api.gold-api.com/price/XAU',{method:'GET',headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(2600)});if(!r.ok)return null;return await r.json();}catch{return null;}
}
