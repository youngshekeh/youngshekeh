// V314 · Truth guard for public market-spine transport.
// Scope: timestamp plausibility only. This does NOT certify exchange licensing,
// trade execution, payment readiness, or overall market quality.
const GOVERNED_FEEDS=new Set(['public-gold-live-api','public-live-markets-api']);
const OPEN_STATES=new Set(['LIVE_BETA','DELAYED_LIVE']);
const MAX_QUOTE_AGE_MS=30*60*1000;
const MAX_BODY_AGE_MS=3*60*1000;
const CLOCK_FUTURE_ALLOWANCE_MS=2*60*1000;

function freshTimestamp(raw,now,maxAge){
  const time=Date.parse(String(raw??''));
  return Number.isFinite(time)&&time<=now+CLOCK_FUTURE_ALLOWANCE_MS&&now-time<=maxAge;
}
function soundQuote(quote,now){
  const price=Number(quote?.price);
  return Number.isFinite(price)&&price>0
    &&freshTimestamp(quote?.market_time,now,MAX_QUOTE_AGE_MS);
}
function quotesFor(feed,body){
  if(feed==='public-gold-live-api'){
    const f=body.feed||{};
    return [f.gold_futures||f.gold,f.dxy,f.brent];
  }
  const assets=Array.isArray(body.assets)?body.assets:[];
  return ['gold','dxy','brent'].map(key=>assets.find(x=>x?.key===key));
}
function proof(state,reason,now){
  return Object.freeze({
    version:'v314-quote-time-truth',
    state,reason,
    checked_at:new Date(now).toISOString(),
    scope:'TIMESTAMP_PLAUSIBILITY_NOT_EXECUTION_OR_LICENSING'
  });
}
function gated(body,feed,status,reason,now){
  const closure=status==='MARKET_CLOSED';
  const marker=proof(closure?'SESSION_CLOSED':'QUOTE_TIME_GATED',reason,now);
  if(feed==='public-gold-live-api')return {
    ...body,market_status:status,proxy_freshness:marker,
    engine:{...body.engine,state:closure?'MARKET_CLOSED':'STALE_DATA',
      action:'WAIT',capital_permission:'0R',confidence_pct:0,
      stale_data:!closure,market_closed:closure}
  };
  return {
    ...body,market_status:status,proxy_freshness:marker,
    decision:{...body.decision,action:'WAIT',capital_permission:'0R',
      note:closure?'Market closed. Quotes are not live executable prices.':
        'Quote freshness is unverified; wait for fresh source timestamps.'},
    regime:{...body.regime,state:closure?'MARKET_CLOSED':'DATA_GATED',
      score:0,drivers:[]},
    assets:Array.isArray(body.assets)?body.assets.map(asset=>
      asset?.key==='gold'?{...asset,action:'WAIT',capital_permission:'0R',
        confidence_pct:0}:asset):body.assets
  };
}
export function enforceQuoteTimeTruth(feed,body,now=Date.now()){
  if(!GOVERNED_FEEDS.has(feed)||!body||typeof body!=='object'||Array.isArray(body))
    return body;
  const status=body.market_status;
  if(status==='MARKET_CLOSED')
    return gated(body,feed,'MARKET_CLOSED','UPSTREAM_SESSION_CLOSED',now);
  if(status==='UNAVAILABLE'||status==='STALE')
    return gated(body,feed,status,'UPSTREAM_DATA_GATED',now);
  if(!OPEN_STATES.has(status))
    return gated(body,feed,'STALE','UNKNOWN_UPSTREAM_MARKET_STATUS',now);
  if(!freshTimestamp(body.generated_at,now,MAX_BODY_AGE_MS))
    return gated(body,feed,'STALE','STALE_UPSTREAM_RESPONSE_TIMESTAMP',now);
  if(!quotesFor(feed,body).every(quote=>soundQuote(quote,now)))
    return gated(body,feed,'STALE','MISSING_INVALID_OR_AGED_QUOTE',now);
  return {...body,proxy_freshness:proof('QUOTE_TIMESTAMPS_WITHIN_30M',
    'REQUIRED_GOLD_DXY_BRENT_QUOTES_CHECKED',now)};
}
