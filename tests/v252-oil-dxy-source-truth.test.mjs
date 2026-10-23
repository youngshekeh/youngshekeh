import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curateMacroQuote,curateMacroPacket,verifyMacroPacket,MACRO_MAX_AGE_MS}
 from '../src/public-macro-reference-data.mjs';
import {readMacroReferences} from '../api/public-macro-reference.js';
const fixed=Date.parse('2026-10-23T14:22:30.000Z');
const unix=Math.floor((fixed-12*60_000)/1000);
const fixture=(id,time=unix,price=id==='wti'?102.50:101.73)=>({chart:{result:[{
 meta:{symbol:id==='wti'?'CL=F':'DX-Y.NYB',
 currency:'USD',exchangeName:id==='wti'?'NYM':'NYB',
 instrumentType:id==='wti'?'FUTURE':'INDEX',regularMarketTime:time,
 regularMarketPrice:price,
 shortName:id==='wti'?'Crude Oil Dec 26':'ICE US Dollar Index - Index - C',
 longName:id==='wti'?'WTI Crude Oil':'US Dollar Index'}
}],error:null}});
test('WTI is contract-labeled NYMEX futures, never WTI spot',()=>{
 const r=curateMacroQuote(fixture('wti'),'wti',fixed);
 assert.equal(r.symbol,'CL=F');
 assert.equal(r.contract_label,'Crude Oil Dec 26');
 assert.equal(r.instrument_type,'FUTURE');
 assert.equal(r.source,'Yahoo Finance');
 assert.equal(r.broker_verified,false);
 assert.equal(r.execution_quote,false);
 assert.equal(r.licensed_commercial_feed_verified,false);
 assert.equal(r.possible_exchange_delay_minutes,30);
});
test('DXY is the exact ICE index, not a DX futures proxy',()=>{
 const r=curateMacroQuote(fixture('dxy'),'dxy',fixed);
 assert.equal(r.symbol,'DXY');
 assert.equal(r.provider_symbol,'DX-Y.NYB');
 assert.equal(r.instrument_type,'INDEX');
 assert.equal(r.contract_label,null);
 assert.equal(r.price,101.73);
});
test('symbol, exchange, instrument, currency, contract and price mismatches fail closed',()=>{
 const cases=[
  ['symbol','DXY'],['exchangeName','ICE'],['instrumentType','INDEX'],
  ['currency','EUR'],['regularMarketPrice',-1],['shortName','Crude Oil Futures']
 ];
 for(const [field,value] of cases){
  const p=fixture('wti');p.chart.result[0].meta[field]=value;
  assert.equal(curateMacroQuote(p,'wti',fixed),null,field);
 }
 const bogus=fixture('dxy');bogus.chart.result[0].meta.symbol='DX=F';
 assert.equal(curateMacroQuote(bogus,'dxy',fixed),null);
});
test('stale, future, missing provider timestamps never display reference prices',()=>{
 for(const t of [Math.floor((fixed-MACRO_MAX_AGE_MS-1000)/1000),
  Math.floor((fixed+7000)/1000),null,0]){
  assert.equal(curateMacroQuote(fixture('wti',t),'wti',fixed),null,String(t));
 }
});
test('macro sources fail independently and leave genuine other asset visible',async()=>{
 const r=await readMacroReferences({read:async url=>{
  if(url.includes('CL%3DF'))throw Error('upstream_timeout');
  return fixture('dxy');
 },now:()=>fixed});
 assert.equal(r.ok,true);assert.equal(r.state,'PARTIAL_DELAYED_REFERENCES');
 assert.equal(r.assets.wti,null);assert.equal(r.assets.dxy?.symbol,'DXY');
 assert.equal(r.expected_sources,2);
});
test('two independent fixed-URL references preserve explicit WAIT/0R',async()=>{
 const urls=[];
 const r=await readMacroReferences({read:async url=>{
  urls.push(url);return fixture(url.includes('CL%3DF')?'wti':'dxy');
 },now:()=>fixed});
 assert.equal(r.sources_verified,2);
 assert.equal(r.state,'BOTH_DELAYED_REFERENCES');
 assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.governance.live_order_submission_enabled,false);
 assert.ok(urls.every(url=>url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/')));
 assert.equal(verifyMacroPacket(r,fixed).count,2);
});
test('unlicensed, tampered and stale macro packets cannot become verified',()=>{
 const wti=curateMacroQuote(fixture('wti'),'wti',fixed);
 const dxy=curateMacroQuote(fixture('dxy'),'dxy',fixed);
 const p=curateMacroPacket({wti,dxy},fixed);
 assert.equal(verifyMacroPacket(p,fixed).count,2);
 assert.equal(verifyMacroPacket({...p,governance:{...p.governance,capital_permission:'1R'}},fixed).count,0);
 assert.equal(verifyMacroPacket({...p,data_rights:'LICENSED'},fixed).count,0);
 assert.equal(verifyMacroPacket({...p,assets:{...p.assets,dxy:{...dxy,source:'unknown'}}},fixed).count,1);
 assert.equal(verifyMacroPacket(p,fixed+MACRO_MAX_AGE_MS+1).count,0);
});
test('missing provider metadata cannot be accepted as an ICE or oil contract',()=>{
 for(const p of [null,{}, {chart:{error:'limit',result:[]}},
  {chart:{error:null,result:[{},{}]}},{chart:{error:null,result:[{meta:{}}]}}]){
  assert.equal(curateMacroQuote(p,'wti',fixed),null);
  assert.equal(curateMacroQuote(p,'dxy',fixed),null);
 }
});
test('Gold independence and 120-second source-time enforcement are retained',()=>{
 const api=readFileSync(new URL('../api/public-market-reference.js',import.meta.url),'utf8');
 const integrity=readFileSync(new URL('../src/v235-reference-integrity.mjs',import.meta.url),'utf8');
 const gold=readFileSync(new URL('../api/public-gold-read.js',import.meta.url),'utf8');
 assert.match(api,/api\.gold-api\.com\/price\/XAU/);
 assert.match(integrity,/recent\(g\?\.source_updated_at,now,120000\)/);
 assert.match(gold,/readIndependentGold/);
 assert.match(gold,/capital_permission:'0R'/);
});
test('Gold/Oil/DXY UI and chart traces only use verified delayed reads',()=>{
 const o=readFileSync(new URL('../src/public-macro-observatory.mjs',import.meta.url),'utf8');
 const d=readFileSync(new URL('../src/public-macro-reference.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../market-observatory/index.html',import.meta.url),'utf8');
 const live=readFileSync(new URL('../live-markets/index.html',import.meta.url),'utf8');
 for(const id of ['ob-wti','ob-dxy','ob-wti-time','ob-dxy-time','ob-wti-trace','ob-dxy-trace'])
  assert.ok(html.includes('id="'+id+'"'),id);
 for(const id of ['pmr-wti','pmr-dxy'])assert.ok(live.includes('id="'+id+'"'),id);
 assert.match(o,/verifyMacroPacket\(macroPacket,Date\.now\(\)\)/);
 assert.match(d,/verifyMacroPacket\(data,Date\.now\(\)\)/);
 assert.match(o,/\/api\/public-macro-reference/);
 assert.match(d,/\/api\/public-macro-reference/);
 assert.doesNotMatch(o+d,/place_order|execute_trade|service_role|mt5_submit|SUPABASE_DB_URL/i);
});
test('release never asserts rights or guaranteed exchange real-time access',()=>{
 const core=readFileSync(new URL('../src/public-macro-reference-data.mjs',import.meta.url),'utf8');
 const api=readFileSync(new URL('../api/public-macro-reference.js',import.meta.url),'utf8');
 assert.match(core,/RESEARCH_EVALUATION_ONLY_COMMERCIAL_LICENSE_NOT_VERIFIED/);
 assert.match(api,/NOT execution-grade/);
 assert.match(api,/CACHE_MS=25000/);
 assert.match(api,/req.method!=='GET'/);
});
