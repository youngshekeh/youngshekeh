import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {evaluateInstitutionalProof as inspect} from '../src/institutional-evidence-v280.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-24T11:00:00Z'),iso=n=>new Date(n).toISOString();
const gov=()=>({action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false});
const quarter=(asset)=>({asset,symbol:asset==='gold'?'GC=F':'BTC-USD',
 source:asset==='gold'?'Yahoo Finance':'Coinbase Exchange',
 source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
 zone_method:'PRIOR_COMPLETED_QUARTER_OHLC_RANGE_2PCT_INNER_BANDS',
 is_actual_orderbook_liquidity:false,probability:null,governance:gov(),
 previous_end_exclusive:'2026-10-01T00:00:00.000Z',previous_quarter:'Q3 2026',current_quarter:'Q4 2026',
 sample_days_prev:64,previous_low:3000,previous_high:5000,source_last_daily_bar:'2026-10-23'});
const packet=()=>({references:{ok:true,reference_only:true,not_for_trade_execution:true,
 independent_of_private_kernel:true,generated_at:iso(NOW-1000),governance:gov(),assets:{
  gold:{symbol:'XAUUSD',currency:'USD',unit:'troy oz',type:'INDICATIVE_SPOT',source:'Gold API',
   price:3996,source_updated_at:iso(NOW-15000),broker_verified:false,execution_quote:false},
  bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',
   price:80000,observed_at:iso(NOW-1000),source_updated_at:null,broker_verified:false,execution_quote:false}
 }},quarterly:{ok:true,reference_only:true,not_for_trade_execution:true,
 generated_at:iso(NOW-1000),assets:{gold:quarter('gold'),bitcoin:quarter('bitcoin')}}});
const row=(result,key)=>result.items.find(x=>x.key===key);
test('source timestamp, receipt-only timestamp and quarterly source are distinct',()=>{
 const p=inspect(packet(),NOW);assert.equal(row(p,'gold').state,'current');
 assert.equal(row(p,'bitcoin').state,'limited');assert.match(row(p,'bitcoin').detail,/upstream quote time not supplied/);
 assert.equal(row(p,'quarterly').state,'historical');assert.match(row(p,'quarterly').detail,/Not order-book liquidity/);
 assert.equal(p.horizon.weekly,'WEEKLY STRUCTURE NOT CERTIFIED');assert.equal(p.capital_permission,'0R');
 assert.equal(p.commerce_permitted,false);
});
test('missing or untrusted governance rejects all spot proofs',()=>{
 for(const patch of [{governance:{}},{independent_of_private_kernel:false},
 {reference_only:false},{generated_at:iso(NOW-160000)}]){
  const p=packet();Object.assign(p.references,patch);
  assert.equal(row(inspect(p,NOW),'gold').state,'withheld');
  assert.equal(row(inspect(p,NOW),'bitcoin').state,'withheld');
 }
});
test('Gold instrument, provider time and execution flag must all pass',()=>{
 for(const patch of [{symbol:'GC=F'},{source:'Spoofed'},{currency:'EUR'},
 {execution_quote:true},{source_updated_at:iso(NOW-121000)}]){
  const p=packet();Object.assign(p.references.assets.gold,patch);
  assert.equal(row(inspect(p,NOW),'gold').state,'withheld');
 }
});
test('Bitcoin receipt cannot masquerade as an upstream quote',()=>{
 const p=packet();p.references.assets.bitcoin.source_updated_at=iso(NOW-1000);
 assert.equal(row(inspect(p,NOW),'bitcoin').state,'withheld');
});
test('quarterly requires real completed bars and unverified rights flag',()=>{
 for(const patch of [{previous_low:9000},{sample_days_prev:0},{source_rights:'licensed'},
 {source_last_daily_bar:'2099-01-01'},{is_actual_orderbook_liquidity:true}]){
  const p=packet();Object.assign(p.quarterly.assets.gold,patch);
  assert.equal(row(inspect(p,NOW),'quarterly').state,'withheld');
 }
});
test('even forged positive macro state does not override weekend closure',()=>{
 const p=packet();p.macro={ok:true,reference_only:true,not_for_trade_execution:true,
 independent_of_private_kernel:true,generated_at:iso(NOW),governance:gov(),
 data_rights:'RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED',assets:{wti:{
 symbol:'CL=F',provider_symbol:'CL=F',exchange:'NYM',instrument_type:'FUTURE',
 type:'DELAYED_INDICATIVE_MARKET_REFERENCE',source:'Yahoo Finance',price:85,currency:'USD',
 possible_exchange_delay_minutes:30,licensed_commercial_feed_verified:false,
 broker_verified:false,execution_quote:false,source_updated_at:iso(NOW)}}};
 assert.equal(row(inspect(p,NOW),'macro').state,'withheld');
});
test('empty macro packet is never labelled verified or delayed live',()=>{
 const p=packet();p.macro={ok:true,reference_only:true,not_for_trade_execution:true,
 independent_of_private_kernel:true,generated_at:iso(NOW),governance:gov(),assets:{}};
 assert.equal(row(inspect(p,NOW),'macro').state,'withheld');
});
test('read-only controls are safe, bounded and visual elements accessible',()=>{
 const app=read('src/institutional-home.ts'),html=read('index.html');
 assert.match(app,/evaluateInstitutionalProof/);assert.match(app,/credentials:'omit'/);
 assert.match(app,/referrerPolicy:'no-referrer'/);assert.match(app,/lastCheck<20_000/);
 assert.doesNotMatch(app,/innerHTML|localStorage|sessionStorage|eval\(/);
 for(const id of ['lens-proof-gold','lens-proof-btc','lens-proof-horizon','source-ledger-summary'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(read('src/institutional-home.css'),/prefers-reduced-motion/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
});
