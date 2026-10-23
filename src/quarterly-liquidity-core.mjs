// V253 | Auditable range-derived quarterly liquidity PROXIES; never order-book liquidity.
// All periods UTC. A missing month of source bars invalidates the whole quarter.
export const QUARTER_ASSETS=Object.freeze({
 gold:{symbol:'GC=F',exchange:'CMX',kind:'FUTURE',label:'Gold COMEX futures',unit:'USD / oz',months:16},
 bitcoin:{symbol:'BTC-USD',exchange:'Coinbase Exchange',kind:'SPOT',label:'Bitcoin spot',unit:'USD / BTC',months:27},
 brent:{symbol:'BZ=F',exchange:'NYM',kind:'FUTURE',label:'Brent futures',unit:'USD / bbl',months:16},
 wti:{symbol:'CL=F',exchange:'NYM',kind:'FUTURE',label:'WTI futures',unit:'USD / bbl',months:16},
 eurusd:{symbol:'EURUSD=X',exchange:'CCY',kind:'CURRENCY',label:'EUR / USD',unit:'USD per EUR',months:16},
 dxy:{symbol:'DX-Y.NYB',exchange:'NYB',kind:'INDEX',label:'U.S. Dollar Index',unit:'index points',months:16},
 spx:{symbol:'^GSPC',exchange:'SNP',kind:'INDEX',label:'S&P 500 index',unit:'index points',months:16},
 nasdaq:{symbol:'^IXIC',exchange:'NIM',kind:'INDEX',label:'Nasdaq Composite',unit:'index points',months:16},
 treasury:{symbol:'^TNX',exchange:'CGI',kind:'INDEX',label:'U.S. 10Y yield index',unit:'index value, not bond price',months:16}
});
// Nasdaq Composite, NOT Nasdaq-100. Gold zones use GC futures, NOT XAU spot.
// Treasury ^TNX is an index indicator, NOT Treasury cash security or futures.
export const QUARTER_MARKET_MAX_AGE_MS=65*60*1000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const positive=x=>finite(x)&&x>0;
const stamp=t=>new Date(t).toISOString();
export function quarterBounds(now=Date.now()){
 if(!finite(now))throw Error('invalid_clock');
 const date=new Date(now),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const currentMonth=Math.floor(month/3)*3;
 const current=Date.UTC(year,currentMonth,1),previous=Date.UTC(year,currentMonth-3,1);
 return Object.freeze({
   current_start:stamp(current),previous_start:stamp(previous),
   previous_end:stamp(current),current_end_exclusive:stamp(Date.UTC(year,currentMonth+3,1)),
   current_label:'Q'+(currentMonth/3+1)+' '+year,
   previous_label:'Q'+((currentMonth+9)%12/3+1)+' '+(currentMonth===0?year-1:year)
 });
}
export function parseYahooQuarterBars(payload,asset,now=Date.now()){
 const c=QUARTER_ASSETS[asset];
 if(!c||asset==='bitcoin')return null;
 const r=payload?.chart?.result;
 if(payload?.chart?.error!=null||!Array.isArray(r)||r.length!==1)return null;
 const {meta,timestamp,indicators}=r[0]||{};
 if(meta?.symbol!==c.symbol||meta?.exchangeName!==c.exchange||meta?.instrumentType!==c.kind
  ||meta?.currency!=='USD'||!Array.isArray(timestamp)||timestamp.length>500)return null;
 const q=indicators?.quote?.[0],hi=q?.high,lo=q?.low;
 if(!Array.isArray(hi)||!Array.isArray(lo)||hi.length!==timestamp.length||lo.length!==timestamp.length)return null;
 const seen=new Set(),rows=[];
 for(let i=0;i<timestamp.length;i++){
  const sec=timestamp[i],high=hi[i],low=lo[i],t=sec*1000;
  // ICE DXY daily feed includes placeholder calendar rows without an OHLC
  // observation. Skip a fully empty bar; never fabricate a high or low.
  if(high==null&&low==null)continue;
  if(!Number.isSafeInteger(sec)||!finite(t)||t<0||t>now+86400000
    ||!positive(high)||!positive(low)||high<low)return null;
  const day=new Date(t).toISOString().slice(0,10);
  if(seen.has(day))return null;
  seen.add(day);rows.push({at:day,high,low});
 }
 // Current Yahoo chart meta price is a vendor-reported snapshot, possibly delayed.
 const quoteTime=meta.regularMarketTime*1000;
 const quote=positive(meta.regularMarketPrice)&&Number.isSafeInteger(meta.regularMarketTime)
   ?{value:meta.regularMarketPrice,at:stamp(quoteTime),time_type:'provider_market'}:null;
 return {rows,quote,source:'Yahoo Finance',instrument:c.symbol,contract_label:c.kind==='FUTURE'?String(meta.shortName||''):'',
   data_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'};
}
export function parseCoinbaseQuarterBars(payload){
 if(!Array.isArray(payload)||payload.length>300)return null;
 const seen=new Set(),rows=[];
 for(const candle of payload){
  if(!Array.isArray(candle)||candle.length<6)return null;
  const [time,low,high,open,close,volume]=candle;
  if(!Number.isSafeInteger(time)||!positive(low)||!positive(high)||low>high||
     !positive(open)||!positive(close)||!finite(volume)||volume<0||
     open>high||open<low||close>high||close<low)return null;
  const day=new Date(time*1000).toISOString().slice(0,10);
  if(seen.has(day))return null;
  seen.add(day);rows.push({at:day,high,low});
 }
 return {rows,quote:null,source:'Coinbase Exchange',instrument:'BTC-USD',contract_label:null,
  data_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'};
}
export function calculateQuarterlyZones(parsed,asset,now=Date.now()){
 const c=QUARTER_ASSETS[asset],bounds=quarterBounds(now);
 if(!c||!parsed||parsed.instrument!==c.symbol||!Array.isArray(parsed.rows))return null;
 const p0=bounds.previous_start.slice(0,10),p1=bounds.previous_end.slice(0,10);
 const c0=bounds.current_start.slice(0,10),today=new Date(now).toISOString().slice(0,10);
 const prev=parsed.rows.filter(r=>r.at>=p0&&r.at<p1);
 const qtd=parsed.rows.filter(r=>r.at>=c0&&r.at<=today);
 const counts=new Map();
 for(const r of prev){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.at)||!positive(r.high)||!positive(r.low)||r.low>r.high)return null;
  const m=r.at.slice(0,7);counts.set(m,(counts.get(m)||0)+1);
 }
 for(let m=0;m<3;m++){
  const month=new Date(Date.parse(bounds.previous_start));month.setUTCMonth(month.getUTCMonth()+m);
  if((counts.get(month.toISOString().slice(0,7))||0)<c.months)return null;
 }
 if(qtd.length<3||qtd.some(x=>!positive(x.high)||!positive(x.low)||x.high<x.low))return null;
 const high=Math.max(...prev.map(r=>r.high)),low=Math.min(...prev.map(r=>r.low));
 const currentHigh=Math.max(...qtd.map(r=>r.high)),currentLow=Math.min(...qtd.map(r=>r.low));
 if(!positive(high)||!positive(low)||high<=low)return null;
 const width=(high-low)*0.02; // precisely 2% of observed prior-quarter range, never orderbook
 const newest=parsed.rows.reduce((latest,r)=>r.at>latest?r.at:latest,'');
 const lastMs=Date.parse(newest+'T00:00:00Z');
 if(!Number.isFinite(lastMs)||lastMs>now+86400000||now-lastMs>7*86400000)return null;
 const quote=parsed.quote&&positive(parsed.quote.value)&&
   Date.parse(parsed.quote.at)<=now+5000&&now-Date.parse(parsed.quote.at)<=QUARTER_MARKET_MAX_AGE_MS
   ?parsed.quote:null;
 return Object.freeze({
  asset,label:c.label,symbol:c.symbol,unit:c.unit,exchange:c.exchange,
  instrument_type:c.kind,source:parsed.source,
  source_last_daily_bar:newest,quote:asset==='bitcoin'?null:quote,
  previous_quarter:bounds.previous_label,current_quarter:bounds.current_label,
  previous_start:bounds.previous_start,previous_end_exclusive:bounds.previous_end,
  sample_days_prev:prev.length,sample_days_qtd:qtd.length,
  previous_low:low,previous_high:high,previous_midpoint:(high+low)/2,
  sell_side_proxy:[low,low+width],buy_side_proxy:[high-width,high],
  current_qtd_low:currentLow,current_qtd_high:currentHigh,
  zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
  is_actual_orderbook_liquidity:false,probability:null,
  source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
  contract_label:parsed.contract_label||null,
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}
 });
}
export function quarterlyPacket(rows,now=Date.now()){
 const assets={};for(const asset of Object.keys(QUARTER_ASSETS))assets[asset]=rows?.[asset]||null;
 const count=Object.values(assets).filter(Boolean).length;
 return {ok:count>0,version:'v253-quarterly-zone-research-v1',
  generated_at:stamp(now),reference_only:true,not_for_trade_execution:true,
  assets,source_count:count,expected_assets:Object.keys(assets).length,
  commercial_data_license_verified:false,background_push_enabled:false,
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}};
}
export function verifyQuarterlyPacket(packet,now=Date.now()){
 const output={};
 if(packet?.ok!==true||packet.reference_only!==true||packet.not_for_trade_execution!==true||
 packet?.governance?.capital_permission!=='0R'||packet?.governance?.live_order_submission_enabled!==false||
 packet?.commercial_data_license_verified!==false){
  return output;
 }
 const generated=Date.parse(packet.generated_at);
 if(!finite(generated)||generated>now+5000||now-generated>12*60*1000)return output;
 const bounds=quarterBounds(now);
 for(const [asset,zone] of Object.entries(packet.assets||{})){
  const c=QUARTER_ASSETS[asset];
  if(!c||!zone||zone.asset!==asset||zone.symbol!==c.symbol||zone.exchange!==c.exchange||
   zone.previous_quarter!==bounds.previous_label||zone.previous_start!==bounds.previous_start||
   zone.current_quarter!==bounds.current_label||zone.is_actual_orderbook_liquidity!==false||
   zone.zone_method!=='PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS'||
   zone.source_rights!=='COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'||
   zone.governance?.capital_permission!=='0R'||zone.governance?.live_order_submission_enabled!==false||
   !positive(zone.previous_high)||!positive(zone.previous_low)||zone.previous_high<=zone.previous_low||
   !Array.isArray(zone.buy_side_proxy)||!Array.isArray(zone.sell_side_proxy))continue;
  const w=(zone.previous_high-zone.previous_low)*0.02;
  if(Math.abs(zone.buy_side_proxy[0]-(zone.previous_high-w))>1e-6||
  Math.abs(zone.sell_side_proxy[1]-(zone.previous_low+w))>1e-6)continue;
  output[asset]=zone;
 }
 return output;
}
