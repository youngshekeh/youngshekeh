export const BOOK_MAX_AGE_MS=30000;
export function unavailableBook(reason='PROVIDER_UNAVAILABLE'){
 return {version:'bitcoin-liquidity-v1',status:'UNAVAILABLE',reason,source:'Coinbase Exchange',symbol:'BTC-USD',research_only:true,live_orders:false,capital_permission:'0R',snapshot:null};
}
const number=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
export function curateBook(body,now=Date.now()){
 const fail=reason=>unavailableBook(reason);
 if(!body||typeof body!=='object'||Array.isArray(body))return fail('INVALID_BOOK');
 if(body.auction_mode===true)return fail('AUCTION_BOOK_WITHHELD');
 const at=typeof body.time==='string'?Date.parse(body.time):NaN;
 if(!Number.isFinite(at)||at>now+2000||now-at>BOOK_MAX_AGE_MS)return fail('STALE_OR_INVALID_SOURCE_TIME');
 if(!Number.isSafeInteger(body.sequence)||body.sequence<=0)return fail('INVALID_SEQUENCE');
 function side(rows,bid){
  if(!Array.isArray(rows)||!rows.length||rows.length>100000)return null;
  const out=rows.slice(0,20).map(r=>Array.isArray(r)?{price:number(r[0]),size:number(r[1]),orders:r[2]}:null);
  for(let i=0;i<out.length;i++){
   const r=out[i];if(!r||![r.price,r.size].every(Number.isFinite)||r.price<=0||r.size<=0||!Number.isSafeInteger(r.orders)||r.orders<1)return null;
   if(i&&(bid?r.price>=out[i-1].price:r.price<=out[i-1].price))return null;
  }
  return out;
 }
 const bids=side(body.bids,true),asks=side(body.asks,false);
 if(!bids||!asks)return fail('INVALID_OR_UNSORTED_LEVELS');
 const bid=bids[0].price,ask=asks[0].price;
 if(bid>=ask)return fail('CROSSED_OR_LOCKED_BOOK');
 const sum=rows=>rows.reduce((s,r)=>s+r.price*r.size,0);
 const bidDepth=sum(bids),askDepth=sum(asks),total=bidDepth+askDepth;
 if(!Number.isFinite(total)||total<=0)return fail('INVALID_DEPTH');
 return {...fail(null),status:'OBSERVED_SNAPSHOT',generated_at:new Date(now).toISOString(),snapshot:{
  observed_at:new Date(at).toISOString(),expires_at:new Date(at+BOOK_MAX_AGE_MS).toISOString(),received_at:new Date(now).toISOString(),sequence:body.sequence,
  best_bid:bid,best_ask:ask,spread_usd:ask-bid,spread_bps:(ask-bid)/((ask+bid)/2)*10000,
  bid_levels:bids.length,ask_levels:asks.length,bid_depth_usd:bidDepth,ask_depth_usd:askDepth,
  bid_price_span:[bids.at(-1).price,bid],ask_price_span:[ask,asks.at(-1).price],
  visible_imbalance:(bidDepth-askDepth)/total,
  scope:'Nearest 20 returned price levels per side on Coinbase only. Visible orders can be canceled. No hidden liquidity, institutional identity, flow or directional probability inferred.'
 }};
}
export function currentBook(packet,now=Date.now()){
 if(packet?.version!=='bitcoin-liquidity-v1'||packet?.research_only!==true||packet?.live_orders!==false||packet?.capital_permission!=='0R'||packet?.status!=='OBSERVED_SNAPSHOT')return null;
 const p=packet.snapshot,at=Date.parse(p?.observed_at),expiry=Date.parse(p?.expires_at);
 if(!Number.isFinite(at)||!Number.isFinite(expiry)||at>now+2000||now-at>BOOK_MAX_AGE_MS||now>=expiry||expiry>at+BOOK_MAX_AGE_MS)return null;
 return p;
}
