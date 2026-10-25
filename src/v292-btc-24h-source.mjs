// V292 independent 24/7 BTC/USD research feed. Provider quote timestamps are
// primary evidence; receiving a newer HTTP response never refreshes an old trade.
// This adapter is NOT activated for paid redistribution or trade execution.
export const BTC_TICKER_SOURCE='https://api.exchange.coinbase.com/products/BTC-USD/ticker';
export const BTC_TICKER_MAX_AGE_MS=90_000;
export const BTC_TICKER_FUTURE_TOLERANCE_MS=5_000;
export const BTC_TICKER_DEADLINE_MS=4_500;
export const BTC_RESEARCH_GOVERNANCE=Object.freeze({
  automatic_execution:false,live_order_submission_enabled:false,
  action_permitted:'WAIT',capital_permission:'0R',
  commercial_redistribution_approved:false
});

function unavailable(reason){
  return Object.freeze({ok:false,state:reason,asset:'BTC',pair:'BTC-USD',
    price_usd:null,source_trade_time:null,age_seconds:null,
    source:'Coinbase Exchange',licensing:'COMMERCIAL_RIGHTS_NOT_VERIFIED',
    governance:BTC_RESEARCH_GOVERNANCE});
}
export function assessBtcExchangeTicker(input,now=Date.now()){
  if(!input||typeof input!=='object'||Array.isArray(input))return unavailable('TICKER_UNAVAILABLE');
  const price=Number(input.price);
  const rawTime=typeof input.time==='string'?input.time:'';
  // Source must supply an unambiguous UTC exchange trade timestamp.
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(rawTime)
    ||rawTime.length>45)return unavailable('SOURCE_TIMESTAMP_INVALID');
  const tradeTime=Date.parse(rawTime);
  if(!Number.isFinite(tradeTime))return unavailable('SOURCE_TIMESTAMP_INVALID');
  const age=now-tradeTime;
  if(age < -BTC_TICKER_FUTURE_TOLERANCE_MS)return unavailable('SOURCE_TIME_IN_FUTURE');
  if(age>BTC_TICKER_MAX_AGE_MS)return unavailable('STALE_EXCHANGE_TRADE');
  if(!Number.isFinite(price)||price<=0||price>100_000_000)
    return unavailable('PRICE_INVALID');
  return Object.freeze({ok:true,state:'SOURCE_CURRENT',asset:'BTC',pair:'BTC-USD',
    price_usd:price,source_trade_time:new Date(tradeTime).toISOString(),
    age_seconds:Math.max(0,Math.round(age/1000)),source:'Coinbase Exchange',
    source_symbol:'BTC-USD',source_type:'EXCHANGE_LAST_TRADE',
    quote_basis:'INDICATIVE_RESEARCH_NOT_EXECUTION_GRADE',
    market_schedule:'24_7',combined_weekday_snapshot_not_overwritten:true,
    licensing:'COMMERCIAL_RIGHTS_NOT_VERIFIED',governance:BTC_RESEARCH_GOVERNANCE});
}
export async function readBtcExchangeResearch({fetchImpl=fetch,now=Date.now}={}){
  try{
    const r=await fetchImpl(BTC_TICKER_SOURCE,{
      method:'GET',headers:{Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-RESEARCH/292'},
      redirect:'error',cache:'no-store',
      signal:AbortSignal.timeout(BTC_TICKER_DEADLINE_MS)
    });
    if(r?.ok!==true)return unavailable('EXCHANGE_TRANSPORT_UNAVAILABLE');
    const body=await r.json();
    return assessBtcExchangeTicker(body,now());
  }catch{
    return unavailable('EXCHANGE_TRANSPORT_UNAVAILABLE');
  }
}
