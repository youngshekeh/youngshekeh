import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMarketStatusFeed,inspectResearchSources} from '../src/status-market-lane.mjs';
import {curatePublicReferences} from '../src/public-market-reference-data.mjs';
import {curateMacroPacket} from '../src/public-macro-reference-data.mjs';
import {quarterlyPacket,quarterBounds,QUARTER_ASSETS} from '../src/quarterly-liquidity-core.mjs';
const now=Date.parse('2026-10-23T16:55:00Z'),at=n=>new Date(n).toISOString();
const wrap=data=>({response:{ok:true},data});
const gov={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false};
function spot(){
 return curatePublicReferences({
  gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',
   price:4050,source_updated_at:at(now-12000),broker_verified:false,execution_quote:false},
  bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',
   price:81111,source_updated_at:null,observed_at:at(now-5000),broker_verified:false,execution_quote:false}
 },now);
}
function macro(){
 const mk=(name)=>({
  symbol:name==='wti'?'CL=F':'DXY',provider_symbol:name==='wti'?'CL=F':'DX-Y.NYB',
  source:'Yahoo Finance',type:'DELAYED_INDICATIVE_MARKET_REFERENCE',
  exchange:name==='wti'?'NYM':'NYB',instrument_type:name==='wti'?'FUTURE':'INDEX',
  currency:'USD',price:100,source_updated_at:at(now-480000),
  possible_exchange_delay_minutes:30,broker_verified:false,
  execution_quote:false,licensed_commercial_feed_verified:false,
  contract_label:name==='wti'?'Crude Oil Dec 26':null
 });
 return curateMacroPacket({wti:mk('wti'),dxy:mk('dxy')},now);
}
function historical(){
 const q=quarterBounds(now),zones={};
 for(const [asset,v] of Object.entries(QUARTER_ASSETS)){
  zones[asset]={
   asset,symbol:v.symbol,exchange:v.exchange,previous_quarter:q.previous_label,
   current_quarter:q.current_label,previous_start:q.previous_start,
   previous_low:90,previous_high:110,buy_side_proxy:[109.6,110],
   sell_side_proxy:[90,90.4],source_last_daily_bar:'2026-10-23',
   source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
   zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
   is_actual_orderbook_liquidity:false,governance:gov
  };
 }
 return quarterlyPacket(zones,now);
}
test('V266 source status labels verified weekend closure without reporting quotes or recovery',()=>{
 const sat=Date.parse('2026-10-24T12:00:00.000Z');
 const packet=curateMacroPacket({},sat);
 const unavailable={response:{ok:false,status:503},data:packet};
 const reading=assessMarketStatusFeed('macro',unavailable,sat);
 assert.equal(reading.state,'WEEKEND CLOSED · NO CURRENT QUOTE');
 assert.equal(reading.available,false);
 assert.equal(reading.full,false);
 assert.equal(reading.count,0);
 assert.equal(reading.licensed_for_commercial_resale,false);
 assert.equal(reading.risk,'WAIT / 0R · NOT BROKER LIVE');
 assert.match(reading.detail,/Provider connectivity is not verified/);
 assert.equal(assessMarketStatusFeed('macro',unavailable,sat+130000).state,'SOURCE UNAVAILABLE');
 assert.equal(assessMarketStatusFeed('macro',unavailable,Date.parse('2026-10-26T12:00:00Z')).state,'SOURCE UNAVAILABLE');
 assert.equal(assessMarketStatusFeed('spot',unavailable,sat).state,'SOURCE UNAVAILABLE');
 assert.equal(assessMarketStatusFeed('macro',{...unavailable,
  data:{...packet,governance:{...packet.governance,capital_permission:'1R'}}},sat).state,'SOURCE UNAVAILABLE');
 assert.equal(assessMarketStatusFeed('macro',{response:{ok:false,status:503},data:{ok:false}},sat).state,'SOURCE UNAVAILABLE');
});
test('all three read-only sources show distinct verified coverage',()=>{
 for(const [kind,packet,count] of [['spot',spot(),2],['macro',macro(),2],['quarterly',historical(),9]]){
  const r=assessMarketStatusFeed(kind,wrap(packet),now);
  assert.equal(r.count,count);
  assert.equal(r.expected,count);
  assert.equal(r.available,true);
  assert.equal(r.full,true);
  assert.match(r.state,/VERIFIED RESEARCH/);
  assert.equal(r.risk,'WAIT / 0R · NOT BROKER LIVE');
  assert.equal(r.licensed_for_commercial_resale,false);
 }
});
test('Gold and Bitcoin source timestamps remain individually verified',()=>{
 const a=assessMarketStatusFeed('spot',wrap(spot()),now);
 assert.match(a.detail,/Gold source timestamp valid/);
 assert.match(a.detail,/receipt valid, not a provider market timestamp/);
 assert.equal(a.observed_at,at(now-12000));
});
test('a partial macro outage never implies 2/2 or certified commercial feed',()=>{
 const packet=macro();
 const a=assessMarketStatusFeed('macro',wrap({...packet,assets:{...packet.assets,dxy:null}}),now);
 assert.equal(a.count,1);assert.equal(a.full,false);
 assert.equal(a.state,'PARTIAL RESEARCH · 1/2');
 assert.equal(a.licensed_for_commercial_resale,false);
});
test('quarterly status is OHLC history, not instantaneous execution quote',()=>{
 const a=assessMarketStatusFeed('quarterly',wrap(historical()),now);
 assert.equal(a.observed_at,null);
 assert.match(a.detail,/Completed-quarter price-range proxies/);
 assert.match(a.detail,/not order-book liquidity/);
 assert.match(a.detail,/2026-10-23/);
});
test('stale, wrong transport, corrupt and trade-enabled packets fail closed',()=>{
 const kinds=[['spot',spot()],['macro',macro()],['quarterly',historical()]];
 for(const [kind,packet] of kinds){
  assert.equal(assessMarketStatusFeed(kind,{response:{ok:false},data:packet},now).available,false);
  assert.equal(assessMarketStatusFeed(kind,wrap({...packet,not_for_trade_execution:false}),now).count,0);
  assert.equal(assessMarketStatusFeed(kind,wrap({...packet,governance:{...packet.governance,capital_permission:'1R'}}),now).count,0);
  assert.equal(assessMarketStatusFeed(kind,wrap({...packet,governance:{...packet.governance,live_order_submission_enabled:true}}),now).count,0);
  const expiration=kind==='macro'?70*60*1000:14*60*1000;
  assert.equal(assessMarketStatusFeed(kind,wrap(packet),now+expiration).count,0);
 }
});
test('independent macro failure still reports complete quarterly history',async()=>{
 const logged=[];
 const result=await inspectResearchSources({
  read:async k=>{if(k==='macro')throw Error('source 503');return wrap(historical())},
  now:()=>now,report:(kind,x)=>logged.push([kind,x.count])
 });
 assert.deepEqual(logged,[['macro',0],['quarterly',9]]);
 assert.equal(result.quarterly.full,true);
 assert.equal(result.macro.available,false);
});
test('source inspector default clock is callable without custom test injection',async()=>{
 const calls=[];
 const result=await inspectResearchSources({
  read:async kind=>{calls.push(kind);return{response:{ok:false},data:{ok:false}}},
 });
 assert.deepEqual(calls,['macro','quarterly']);
 assert.equal(result.macro.available,false);
 assert.equal(result.quarterly.available,false);
});
test('no market data source can alter private release gate source code',()=>{
 const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
 const pure=readFileSync(new URL('../src/status-market-lane.mjs',import.meta.url),'utf8');
 for(const id of ['public-macro','public-quarterly','public-macro-proof','public-quarterly-proof'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(status,/void loadMarketExtras\(\)/);
 assert.match(status,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.match(status,/inspectResearchSources\(\{/);
 assert.match(status,/probePublicStatus\(\{/);
 assert.doesNotMatch(pure,/SUPABASE_DB_URL|SERVICE_ROLE|place_order|execute_trade|paywall|sessionToken|cron\.alter_job/i);
});
