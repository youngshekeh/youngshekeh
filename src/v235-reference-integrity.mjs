// V235: audited, independently sourced spot observations for research UI only.
import {publiclyDisplayableBitcoin} from './v293-public-btc-license.mjs';
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const recent=(at,now,maxAge)=>{
 const t=Date.parse(String(at||''));
 return Number.isFinite(t)&&t<=now+5000&&now-t<=maxAge;
};
export function verifiedPublicReferences(packet,now=Date.now()){
 const empty=Object.freeze({gold:null,bitcoin:null,count:0});
 if(packet?.ok!==true||packet.reference_only!==true||packet.not_for_trade_execution!==true
  ||packet.governance?.capital_permission!=='0R'
  ||packet.governance?.live_order_submission_enabled!==false)return empty;
 const g=packet.assets?.gold,b=packet.assets?.bitcoin;
 const gold=g?.symbol==='XAUUSD'&&g?.currency==='USD'&&g?.type==='INDICATIVE_SPOT'
  &&g?.source==='Gold API'&&g?.broker_verified===false&&g?.execution_quote===false
  &&positive(g?.price)&&recent(g?.source_updated_at,now,120000)
  ?Object.freeze({value:g.price,source:'Gold API',label:'INDICATIVE SPOT',at:g.source_updated_at,time_type:'source'}):null;
 const bitcoin=publiclyDisplayableBitcoin(b); // Never enable end-user display from receipt-only Coinbase data.
 return Object.freeze({gold,bitcoin,count:Number(Boolean(gold))+Number(Boolean(bitcoin))});
}
