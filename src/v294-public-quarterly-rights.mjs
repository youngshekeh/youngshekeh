// V294: Coinbase Market Data Terms, updated 2026-08-07, prohibit externally
// disseminated Derived Works without separate written authorization.
// No user-provided flag, environment setting or HTTP response can unlock the hold.
export const PUBLIC_BTC_QUARTERLY_RIGHTS=Object.freeze({
 asset:'BTC',source:'Coinbase Exchange',display_rights:'UNVERIFIED',
 derived_analytics_redistribution_approved:false,public_quarterly_range_allowed:false,
 policy:'LICENSED_DATA_PROVIDER_REQUIRED',
 reference:'https://www.coinbase.com/legal/market_data'
});
export function enforcePublicQuarterlyRights(snapshot={}){
 const clean={};
 if(snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)){
  for(const [key,value] of Object.entries(snapshot)){
   if(key!=='bitcoin'&&key!=='__proto__'&&key!=='constructor'&&key!=='prototype')clean[key]=value;
  }
 }
 return Object.freeze({...clean,bitcoin:null});
}
