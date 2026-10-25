import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MARKET_FEED_PLAN,MARKET_RENDER_INTERVAL_MS,validateMarketFeed,
 readMarketFeed,marketStreamSummary} from '../src/market-feed-cadence.mjs';
import {QUARTER_ASSETS,quarterBounds,quarterlyPacket} from '../src/quarterly-liquidity-core.mjs';
import {curateMacroPacket} from '../src/public-macro-reference-data.mjs';

const now=Date.parse('2026-10-23T16:20:00.000Z');
const stamp=v=>new Date(v).toISOString();
const scope={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false};
function quarterly(){
 const q=quarterBounds(now),wti={asset:'wti',symbol:'CL=F',exchange:'NYM',
   previous_quarter:q.previous_label,previous_start:q.previous_start,
   current_quarter:q.current_label,previous_low:90,previous_high:110,
   buy_side_proxy:[109.6,110],sell_side_proxy:[90,90.4],
   zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
   source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
   is_actual_orderbook_liquidity:false,governance:scope};
 return quarterlyPacket({wti},now);
}
function spot(goldAge=30_000,btcAge=10_000){
 return {ok:true,reference_only:true,not_for_trade_execution:true,
   governance:scope,assets:{
    gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',
      source:'Gold API',price:4000,source_updated_at:stamp(now-goldAge),
      broker_verified:false,execution_quote:false},
    bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',
      source:'Coinbase',price:80000,source_updated_at:null,
      observed_at:stamp(now-btcAge),broker_verified:false,execution_quote:false}
   }};
}
function macro(age=10*60_000){
 const mk=(kind)=>({
  symbol:kind==='wti'?'CL=F':'DXY',
  provider_symbol:kind==='wti'?'CL=F':'DX-Y.NYB',
  source:'Yahoo Finance',type:'DELAYED_INDICATIVE_MARKET_REFERENCE',
  exchange:kind==='wti'?'NYM':'NYB',
  instrument_type:kind==='wti'?'FUTURE':'INDEX',
  currency:'USD',price:kind==='wti'?101:102,
  source_updated_at:stamp(now-age),possible_exchange_delay_minutes:30,
  broker_verified:false,execution_quote:false,
  licensed_commercial_feed_verified:false,
  contract_label:kind==='wti'?'Crude Oil Dec 26':null
 });
 return curateMacroPacket({wti:mk('wti'),dxy:mk('dxy')},now);
}
test('cadences are independent: BTC 15s, oil/DXY 30s, historical 5m',()=>{
 assert.equal(MARKET_FEED_PLAN.spot.intervalMs,15000);
 assert.equal(MARKET_FEED_PLAN.macro.intervalMs,30000);
 assert.equal(MARKET_FEED_PLAN.quarterly.intervalMs,300000);
 assert.equal(MARKET_RENDER_INTERVAL_MS,15000);
 assert.equal(300000/60000,5);
});
test('three fixed safe source endpoints cannot be redirected by input',()=>{
 assert.deepEqual(Object.fromEntries(Object.entries(MARKET_FEED_PLAN).map(([k,v])=>[k,v.url])),{
  quarterly:'/api/public-quarterly-zones',
  spot:'/api/public-market-reference',
  macro:'/api/public-macro-reference'
 });
 assert.throws(()=>validateMarketFeed('orders',spot(),now),/invalid_feed_kind/);
});
test('current nine-market historical response can be accepted independently',()=>{
 const r=validateMarketFeed('quarterly',quarterly(),now);
 assert.equal(r.count,1);assert.equal(r.packet.governance.capital_permission,'0R');
 const report=marketStreamSummary('quarterly',quarterly(),now);
 assert.equal(report.state,'PARTIAL RESEARCH');
 assert.equal(report.expected,9);
 assert.equal(report.credentialed_broker_quote,false);
});
test('unlicensed BTC receipt withheld at all ages; Gold reference expiry preserved',()=>{
 const valid=validateMarketFeed('spot',spot(20_000,15_000),now);
 assert.equal(valid.count,1);
 const old=validateMarketFeed('spot',spot(20_000,31_000),now);
 assert.equal(old.count,1);
 assert.equal(marketStreamSummary('spot',spot(125_000,31_000),now).count,0);
});
test('delayed WTI/DXY observations retain vendor age limits and commercial rights gate',()=>{
 assert.equal(validateMarketFeed('macro',macro(),now).count,2);
 assert.equal(validateMarketFeed('macro',macro(66*60_000),now),null);
 assert.equal(validateMarketFeed('macro',{...macro(),data_rights:'LICENSED'},now),null);
});
test('source isolation: quarterly failure cannot nullify valid spot and macro data',async()=>{
 const received=[];
 const read=async(url,deadline)=>{
  received.push({url,deadline});
  if(url.includes('quarterly'))throw Error('503_historical_provider');
  if(url.includes('macro'))return macro();
  return spot();
 };
 const [a,b,c]=await Promise.all(['quarterly','spot','macro']
  .map(kind=>readMarketFeed(kind,{read,now:()=>now})));
 assert.equal(a,null);assert.equal(b.count,1);assert.equal(c.count,2);
 assert.equal(received.length,3);
});
test('source isolation: BTC outage cannot erase a current quarterly range or WTI/DXY',async()=>{
 const read=async(url)=>{
  if(url.includes('market-reference'))throw Error('btc_gold_provider_failed');
  if(url.includes('macro'))return macro();
  return quarterly();
 };
 const [a,b,c]=await Promise.all(['quarterly','spot','macro']
  .map(kind=>readMarketFeed(kind,{read,now:()=>now})));
 assert.equal(a.count,1);assert.equal(b,null);assert.equal(c.count,2);
});
test('no response can grant trading through the monitor even with malicious packets',()=>{
 for(const kind of ['quarterly','spot','macro']){
  const original=kind==='quarterly'?quarterly():kind==='spot'?spot():macro();
  for(const mutation of [
   {...original,not_for_trade_execution:false},
   {...original,governance:{...original.governance,capital_permission:'1R'}},
   {...original,governance:{...original.governance,live_order_submission_enabled:true}}
  ])assert.equal(validateMarketFeed(kind,mutation,now),null);
 }
});
test('partial provider packets display partial research, never broker-verified states',()=>{
 const status=marketStreamSummary('spot',spot(20_000,31_000),now);
 assert.equal(status.state,'PARTIAL RESEARCH');
 assert.equal(status.count,1);
 assert.equal(status.trade_permission,'WAIT');
 assert.equal(status.capital_permission,'0R');
 assert.equal(status.commercial_market_data_license_verified,false);
});
test('UI subscribes to independent timers, source status and preserves V254 alert rules',()=>{
 const ui=readFileSync(new URL('../src/quarterly-observatory.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../market-observatory/index.html',import.meta.url),'utf8');
 for(const key of ['quarterly','spot','macro'])
  assert.ok(html.includes('data-quarter-feed-'+key),key);
 assert.match(ui,/timers\.set\(kind,window\.setInterval/);
 assert.match(ui,/plan\.intervalMs/);
 assert.match(ui,/readMarketFeed\(kind/);
 assert.match(ui,/advanceQuarterWatch\(observations,classified,\{armed:alertsArmed,now\}\)/);
 assert.match(ui,/!document\.hidden/);
 assert.match(ui,/Notification\.requestPermission\(\)/);
 assert.doesNotMatch(ui,/fetchZoneData|SERVICE_ROLE|SUPABASE_DB_URL|place_order|execute_trade|navigator\.serviceWorker|localStorage/i);
});
