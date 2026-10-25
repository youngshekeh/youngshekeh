// V293 immutable session and quote provenance classification.
// Classification never upgrades trade or paid entitlement permissions.
export const SESSION_PROVENANCE_HOLD=Object.freeze({
  capital_permission:'0R',automatic_execution:false,
  live_order_submission_enabled:false,paid_entitlement_certified:false
});
const AGES_MS=Object.freeze({bitcoin:90_000,gold:120_000,dxy:120_000,
 eurusd:120_000,brent:120_000,us10y:24*3600_000});
function invalid(kind,age){
 return Object.freeze({state:kind,source_age_seconds:age,tradeable:false,
  verified_live:false,governance:SESSION_PROVENANCE_HOLD});
}
export function classifyAssetSourceTime({key,market_time,price},now=Date.now()){
 const stamp=typeof market_time==='string'&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(market_time)
  ?Date.parse(market_time):NaN;
 if(!Number.isFinite(stamp))return invalid('SOURCE_TIME_MISSING',null);
 const age=now-stamp,seconds=Math.round(age/1000);
 if(age < -5_000)return invalid('SOURCE_TIME_IN_FUTURE',seconds);
 if(!Number.isFinite(price)||price<=0)return invalid('PRICE_INVALID',seconds);
 const max=AGES_MS[key];
 if(!Number.isFinite(max))return invalid('ASSET_NOT_SUPPORTED',seconds);
 if(age>max){
  // This distinguishes venue weekends from 24/7 BTC without certifying
  // the last Friday price as a live market observation.
  const weekend=[0,6].includes(new Date(now).getUTCDay());
  const venue=key==='bitcoin'?'CRYPTO_24_7':'SESSION_BASED';
  return Object.freeze({...invalid(weekend&&venue==='SESSION_BASED'
      ?'WEEKEND_SESSION_REFERENCE_NOT_LIVE':'SOURCE_STALE',seconds),
    venue,source_timestamp:new Date(stamp).toISOString()});
 }
 return Object.freeze({
  state:'SOURCE_RECENT_INDICATIVE',source_age_seconds:seconds,
  source_timestamp:new Date(stamp).toISOString(),
  tradeable:false,verified_live:false,
  quote_basis:'REFERENCE_ONLY_NEVER_BROKER_EXECUTION',
  governance:SESSION_PROVENANCE_HOLD
 });
}
