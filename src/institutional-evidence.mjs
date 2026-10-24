// V279: privacy-preserving, fail-closed presentation of public research evidence.
// The page never turns a receipt into an execution quote or a licensed data product.
export const HOMEPAGE_PUBLIC_ENDPOINTS=Object.freeze([
 '/api/public-market-reference','/api/public-macro-reference',
 '/api/public-quarterly-zones','/api/public-recovery-triage'
]);
const isoAge=(value,now,windowMs)=>{
 if(typeof value!=='string'||!value.trim())return null;
 const t=Date.parse(value);
 if(!Number.isFinite(t)||t>now+5000||now-t<0||now-t>windowMs)return null;
 return t;
};
const formatUTC=value=>{
 const n=Date.parse(String(value??''));
 return Number.isFinite(n)?new Date(n).toISOString().replace('T',' ').slice(0,16)+' UTC':'time unavailable';
};
const item=(key,verdict,detail,state)=>Object.freeze({key,verdict,detail,state});
export function evaluateHomeEvidence(data={},now=Date.now()){
 const ref=data.references,macro=data.macro,quarterly=data.quarterly,recovery=data.recovery;
 const refFresh=ref?.ok===true&&isoAge(ref.generated_at,now,90_000)!==null
  &&ref.reference_only===true&&ref.not_for_trade_execution===true;
 const gold=refFresh?ref?.assets?.gold:null;
 const goldAt=isoAge(gold?.source_updated_at,now,120_000);
 const goldValid=gold&&goldAt!==null&&gold.source==='Gold API'
   &&Number.isFinite(gold.price)&&gold.price>0
   &&gold.broker_verified===false&&gold.execution_quote===false;
 const bitcoin=refFresh?ref?.assets?.bitcoin:null;
 const btcAt=isoAge(bitcoin?.observed_at,now,90_000);
 const btcReceipt=bitcoin&&btcAt!==null&&bitcoin.source==='Coinbase'
  &&Number.isFinite(bitcoin.price)&&bitcoin.price>0
  &&bitcoin.execution_quote===false;
 const btcProviderTime=btcReceipt?isoAge(bitcoin?.source_updated_at,now,120_000):null;
 const macroFresh=macro?.ok===true&&isoAge(macro.generated_at,now,120_000)!==null
  &&macro.reference_only===true&&macro.not_for_trade_execution===true;
 const qFresh=quarterly?.ok===true&&quarterly.reference_only===true
  &&quarterly.not_for_trade_execution===true
  &&isoAge(quarterly.generated_at,now,15*60_000)!==null;
 const qGold=qFresh?quarterly.assets?.gold:null;
 const qBitcoin=qFresh?quarterly.assets?.bitcoin:null;
 const qValid=qGold&&qBitcoin
  &&qGold.is_actual_orderbook_liquidity===false
  &&qBitcoin.is_actual_orderbook_liquidity===false
  &&qGold.zone_method==='PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS'
  &&qBitcoin.zone_method===qGold.zone_method
  &&qGold.source_rights==='COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'
  &&qBitcoin.source_rights==='COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED';
 const coreIncident=recovery?.ok===true
  &&isoAge(recovery.generated_at,now,10*60_000)!==null
  &&recovery.state==='DATABASE INCIDENT REPORTED';
 return Object.freeze({
  version:'v279-institutional-evidence-v1',
  core_status:coreIncident?'DATABASE INCIDENT REPORTED':'PRIVATE CORE NOT CERTIFIED',
  items:Object.freeze([
   goldValid?item('gold','SOURCE TIME VERIFIED',
    'Gold API · indicative spot observation '+formatUTC(gold.source_updated_at),'current')
    :item('gold','SOURCE NOT VERIFIED','No current source-timestamped spot quote can be certified.','withheld'),
   btcReceipt?item('bitcoin',btcProviderTime===null?'RECEIPT ONLY':'SOURCE TIME VERIFIED',
    btcProviderTime===null?'Coinbase receipt '+formatUTC(bitcoin.observed_at)+' · upstream quote time not supplied':
     'Coinbase spot · upstream '+formatUTC(bitcoin.source_updated_at),btcProviderTime===null?'limited':'current')
    :item('bitcoin','RECEIPT NOT VERIFIED','No current Coinbase spot receipt can be certified.','withheld'),
   macroFresh?item('macro','DELAYED REFERENCE ONLY',
    'Market-session and upstream observation age must be checked in the detailed dashboard.','limited')
    :item('macro','SOURCE / SESSION UNAVAILABLE','WTI and DXY are withheld when the provider is unavailable or the market is closed.','withheld'),
   qValid?item('quarterly','HISTORICAL OHLC PROXY',
    'Prior-quarter completed candles · Gold '+String(qGold.source_last_daily_bar??'date unavailable')+
    ' · Bitcoin '+String(qBitcoin.source_last_daily_bar??'date unavailable')+
    ' · not order-book liquidity; commercial redistribution rights unverified.','historical')
    :item('quarterly','HISTORICAL SOURCE UNAVAILABLE','Prior-quarter OHLC proxy unavailable or invalid. No liquidity claim.','withheld')
  ]),
  commerce_permitted:false,
  broker_quote_certified:false,
  capital_permission:'0R'
 });
}
