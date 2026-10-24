// V280: strict, fail-closed presentation validator for public research. Not execution.
import {evaluateHomeEvidence} from './institutional-evidence.mjs';
import {isMacroWeekendClosed} from './public-macro-reference-data.mjs';
const goodTime=(v,now,maxAge)=>{if(typeof v!=='string'||!v)return false;
 const t=Date.parse(v);return Number.isFinite(t)&&t<=now+5000&&now-t>=0&&now-t<=maxAge};
const protectedRead=x=>x?.ok===true&&x.reference_only===true&&x.not_for_trade_execution===true
 &&x.governance?.action_permitted==='WAIT'&&x.governance?.capital_permission==='0R'
 &&x.governance?.live_order_submission_enabled===false;
const num=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const item=(key,verdict,detail,state)=>Object.freeze({key,verdict,detail,state});
const utc=x=>new Date(x).toISOString().replace('T',' ').slice(0,16)+' UTC';
const validDay=(v,now)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)
 &&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&Date.parse(v+'T00:00:00Z')<=now
 &&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function evaluateInstitutionalProof(data={},now=Date.now()){
 const legacy=evaluateHomeEvidence(data,now);
 const r=data.references,m=data.macro,q=data.quarterly;
 const readOK=protectedRead(r)&&r.independent_of_private_kernel===true&&goodTime(r.generated_at,now,90_000);
 const g=readOK?r.assets?.gold:null,b=readOK?r.assets?.bitcoin:null;
 const gold=Boolean(g?.symbol==='XAUUSD'&&g.currency==='USD'&&g.type==='INDICATIVE_SPOT'
  &&g.unit==='troy oz'&&g.source==='Gold API'&&num(g.price)
  &&goodTime(g.source_updated_at,now,120_000)&&g.broker_verified===false&&g.execution_quote===false);
 const bitcoin=Boolean(b?.symbol==='BTCUSD'&&b.currency==='USD'
  &&b.type==='SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED'&&b.source==='Coinbase'
  &&b.source_updated_at===null&&num(b.price)&&goodTime(b.observed_at,now,90_000)
  &&b.broker_verified===false&&b.execution_quote===false);
 const macroOK=protectedRead(m)&&m.independent_of_private_kernel===true
  &&m.data_rights==='RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED'
  &&goodTime(m.generated_at,now,120_000)&&!isMacroWeekendClosed(now);
 const macroAsset=(v,sym,pSym,venue,type)=>Boolean(macroOK&&v?.symbol===sym
  &&v.provider_symbol===pSym&&v.exchange===venue&&v.instrument_type===type
  &&v.type==='DELAYED_INDICATIVE_MARKET_REFERENCE'&&v.source==='Yahoo Finance'
  &&v.currency==='USD'&&num(v.price)&&v.possible_exchange_delay_minutes===30
  &&v.licensed_commercial_feed_verified===false&&v.broker_verified===false
  &&v.execution_quote===false&&goodTime(v.source_updated_at,now,65*60_000));
 const wti=macroAsset(m?.assets?.wti,'CL=F','CL=F','NYM','FUTURE'),
  dxy=macroAsset(m?.assets?.dxy,'DXY','DX-Y.NYB','NYB','INDEX');
 const qOK=q?.ok===true&&q.reference_only===true&&q.not_for_trade_execution===true
  &&goodTime(q.generated_at,now,15*60_000),qa=qOK?q.assets?.gold:null,qb=qOK?q.assets?.bitcoin:null;
 const hist=(x,asset,symbol,provider)=>{
  const end=Date.parse(String(x?.previous_end_exclusive??''));
  return x?.asset===asset&&x.symbol===symbol&&x.source===provider
   &&x.source_rights==='COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED'
   &&x.zone_method==='PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS'
   &&x.is_actual_orderbook_liquidity===false&&x.probability===null
   &&x.governance?.action_permitted==='WAIT'&&x.governance?.capital_permission==='0R'
   &&Number.isFinite(end)&&end<=now
   &&/^Q[1-4] 20\d{2}$/.test(String(x.previous_quarter))
   &&Number.isSafeInteger(x.sample_days_prev)&&x.sample_days_prev>=15
   &&num(x.previous_low)&&num(x.previous_high)&&x.previous_high>x.previous_low
   &&validDay(x.source_last_daily_bar,now);
 };
 const quarterly=Boolean(hist(qa,'gold','GC=F','Yahoo Finance')
   &&hist(qb,'bitcoin','BTC-USD','Coinbase Exchange')
   &&qa.previous_quarter===qb.previous_quarter&&qa.current_quarter===qb.current_quarter);
 return Object.freeze({version:'v280-evidence-acceptance-v1',core_status:legacy.core_status,
  items:Object.freeze([
   gold?item('gold','SOURCE TIME VERIFIED','Gold API indicative spot · '+utc(g.source_updated_at),'current'):
    item('gold','SOURCE NOT VERIFIED','Exact XAUUSD identity, upstream clock and 0R governance required.','withheld'),
   bitcoin?item('bitcoin','RECEIPT TIME ONLY','Coinbase received '+utc(b.observed_at)+' · upstream quote time not supplied.','limited'):
    item('bitcoin','RECEIPT NOT VERIFIED','Coinbase identity, receipt clock and 0R governance required.','withheld'),
   wti||dxy?item('macro','DELAYED · '+(Number(wti)+Number(dxy))+'/2 VERIFIED',
     (wti?'WTI ':'')+(dxy?'DXY ':'')+'provider market times, up to 30-minute delay; commercial rights unverified.','limited'):
    item('macro','CLOSED / SOURCE UNAVAILABLE','Weekend, invalid provider time or no verified oil/dollar reference.','withheld'),
   quarterly?item('quarterly','HISTORICAL OHLC PROXY',qa.previous_quarter+' completed daily bars · Gold '+qa.sample_days_prev+
     ', BTC '+qb.sample_days_prev+'. Not order-book liquidity; redistribution rights unverified.','historical'):
    item('quarterly','HISTORICAL PROXY WITHHELD','Completed-quarter OHLC, range and source rights require verification.','withheld')
  ]),
  source_summary:(Number(gold)+Number(bitcoin))+'/2 SPOT SOURCES · GOLD '+(gold?'SOURCE CLOCK':'WITHHELD')+' · BTC '+(bitcoin?'RECEIPT CLOCK':'WITHHELD'),
  horizon:Object.freeze({session:gold?'GOLD SOURCE CLOCK VERIFIED':bitcoin?'BITCOIN RECEIPT ONLY':'SESSION EVIDENCE WITHHELD',
    weekly:'WEEKLY STRUCTURE NOT CERTIFIED',
    quarterly:quarterly?qa.previous_quarter+' HISTORICAL OHLC':'QUARTERLY PROXY WITHHELD'}),
  verified:Object.freeze({gold,bitcoin,quarterly,wti,dxy}),
  commerce_permitted:false,broker_quote_certified:false,capital_permission:'0R'
 });
}
