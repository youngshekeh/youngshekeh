// V252 independent PUBLIC delayed market observation lane. NOT execution-grade.
export const MACRO_MAX_AGE_MS=65*60*1000; // accounts for documented exchange data delays
export const MACRO_FUTURE_SKEW_MS=5000;
export const MACRO_GOVERNANCE=Object.freeze({
 action_permitted:'WAIT',capital_permission:'0R',
 live_order_submission_enabled:false,machine_execution_allowed:false,market_data_only:true
});
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const instruments=Object.freeze({
 wti:Object.freeze({feedSymbol:'CL=F',instrument:'FUTURE',exchange:'NYM',
   symbol:'CL=F',name:'WTI crude futures',unit:'USD/barrel'}),
 dxy:Object.freeze({feedSymbol:'DX-Y.NYB',instrument:'INDEX',exchange:'NYB',
   symbol:'DXY',name:'ICE U.S. Dollar Index',unit:'index points'})
});
export function curateMacroQuote(payload,kind,now=Date.now()){
 const cfg=instruments[kind];
 if(!cfg||payload?.chart?.error!=null)return null;
 const result=payload?.chart?.result;
 if(!Array.isArray(result)||result.length!==1)return null;
 const meta=result[0]?.meta;
 if(meta?.symbol!==cfg.feedSymbol||meta?.instrumentType!==cfg.instrument
    ||meta?.exchangeName!==cfg.exchange||meta?.currency!=='USD')return null;
 if(kind==='wti'&&!(typeof meta.shortName==='string'&&/^Crude Oil [A-Z][a-z]{2} \d{2}$/.test(meta.shortName)))return null;
 if(kind==='dxy'&&!(String(meta.longName||'').includes('Dollar Index')
   && String(meta.shortName||'').includes('Dollar Index')))return null;
 const price=meta.regularMarketPrice;
 const t=Number(meta.regularMarketTime)*1000;
 if(!positive(price)||!Number.isSafeInteger(meta.regularMarketTime)
    ||!Number.isFinite(t)||t>now+MACRO_FUTURE_SKEW_MS
    ||now-t>MACRO_MAX_AGE_MS)return null;
 return Object.freeze({
  symbol:cfg.symbol,provider_symbol:cfg.feedSymbol,name:cfg.name,price,
  currency:'USD',unit:cfg.unit,instrument_type:cfg.instrument,
  type:'DELAYED_INDICATIVE_MARKET_REFERENCE',
  source:'Yahoo Finance',source_url:'https://finance.yahoo.com/quote/'+encodeURIComponent(cfg.feedSymbol)+'/',
  exchange:cfg.exchange,contract_label:kind==='wti'?meta.shortName:null,
  source_updated_at:new Date(t).toISOString(),observed_at:new Date(t).toISOString(),
  possible_exchange_delay_minutes:30,age_seconds:Math.max(0,Math.floor((now-t)/1000)),
  broker_verified:false,execution_quote:false,licensed_commercial_feed_verified:false
 });
}
export function curateMacroPacket({wti=null,dxy=null}={},now=Date.now()){
 const count=Number(Boolean(wti))+Number(Boolean(dxy));
 return Object.freeze({
  ok:count>0,version:'v252-public-oil-dxy-delayed-references-v1',
  state:count===2?'BOTH_DELAYED_REFERENCES':count===1?'PARTIAL_DELAYED_REFERENCES':'REFERENCES_UNAVAILABLE',
  generated_at:new Date(now).toISOString(),independent_of_private_kernel:true,
  reference_only:true,not_for_trade_execution:true,
  data_rights:'RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED',
  assets:Object.freeze({wti,dxy}),sources_verified:count,expected_sources:2,
  governance:MACRO_GOVERNANCE
 });
}
export function verifyMacroPacket(packet,now=Date.now()){
 const empty=Object.freeze({wti:null,dxy:null,count:0});
 if(packet?.ok!==true||packet.reference_only!==true||packet.not_for_trade_execution!==true
  ||packet.data_rights!=='RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED'
  ||packet.governance?.action_permitted!=='WAIT'
  ||packet.governance?.capital_permission!=='0R'
  ||packet.governance?.live_order_submission_enabled!==false)return empty;
 const check=(asset,kind)=>{
  const cfg=instruments[kind];
  if(asset?.symbol!==cfg.symbol||asset?.provider_symbol!==cfg.feedSymbol
   ||asset?.source!=='Yahoo Finance'||asset?.type!=='DELAYED_INDICATIVE_MARKET_REFERENCE'
   ||asset?.exchange!==cfg.exchange||asset?.instrument_type!==cfg.instrument
   ||asset?.currency!=='USD'||asset?.broker_verified!==false
   ||asset?.execution_quote!==false||asset?.licensed_commercial_feed_verified!==false
   ||!positive(asset.price)||asset.possible_exchange_delay_minutes!==30)return null;
  const t=Date.parse(String(asset.source_updated_at||''));
  if(!Number.isFinite(t)||t>now+MACRO_FUTURE_SKEW_MS||now-t>MACRO_MAX_AGE_MS)return null;
  if(kind==='wti'&&!/^Crude Oil [A-Z][a-z]{2} \d{2}$/.test(String(asset.contract_label||'')))return null;
  return Object.freeze({value:asset.price,at:asset.source_updated_at,
   source:'Yahoo Finance',time_type:'provider_market',
   label:'DELAYED · NOT EXECUTABLE',contract_label:asset.contract_label});
 };
 const wti=check(packet.assets?.wti,'wti'),dxy=check(packet.assets?.dxy,'dxy');
 return Object.freeze({wti,dxy,count:Number(Boolean(wti))+Number(Boolean(dxy))});
}
