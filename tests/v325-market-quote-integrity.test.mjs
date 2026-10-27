// V325 isolated contract tests for real staged Deno market handler source.
// No network, no licensed quote providers, no trading or user data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL(
 '../docs/release/V325-REVIEW-ONLY-public-live-markets-api.ts',
 import.meta.url),'utf8');
const nowIso=(ageMin=0)=>new Date(Date.now()-ageMin*60000).toISOString();
const mk=(price,age=1,source='synthetic delayed indicator')=>({
 price,previous_close:price*0.997,change_pct:0.3,
 market_time:nowIso(age),source,instrument_type:'INDEX'});
function spine(overrides={}){
 const feed={
  gold_futures:mk(4400,1),dxy:mk(100.2,1),
  brent:mk(84.7,1),us10y:mk(4.2,1),
  eurusd:mk(1.18,1),bitcoin:mk(98765,1)
 };
 for(const [key,value] of Object.entries(overrides.feed||{}))
   feed[key]=value;
 return {ok:true,market_status:overrides.market_status||'LIVE_BETA',
  feed,engine:{
    state:'HERO_REPAIR',confidence_pct:73,
    hero_score:4,dragon_score:0,action:'EVALUATE',
    capital_permission:'MAX_0.25R',
    broker_quote_age_seconds:overrides.broker_age??null
  },live_broker:{state:overrides.broker_state||'UNAVAILABLE'},
  latest_macro:null,latest_governed_report:null};
}
function app(data,{upstreamError=false}={}){
 let handler;const calls=[];
 runInNewContext(stripTypeScriptTypes(source,{mode:'strip'}),{
  Deno:{serve:cb=>handler=cb},
  fetch:async(url,options={})=>{
    calls.push({url:String(url),method:options.method||'GET'});
    if(upstreamError)return new Response('temporary upstream failure',{status:503});
    return new Response(JSON.stringify(data),{
      status:200,headers:{'Content-Type':'application/json'}});
  },
  URL,Date,Math,Number,String,Object,Boolean,
  Request,Response,AbortSignal,console,Promise,
 },{timeout:7000});
 assert.equal(typeof handler,'function');
 return {calls, async request(method='GET'){
   let res=await handler(new Request('https://fake-market.invalid/',{method}));
   return {status:res.status,body:await res.json(),headers:res.headers};
 }};
}
const getAsset=(body,key)=>body.assets.find(x=>x.key===key);
test('fresh publicly sourced Gold/DXY/Brent stay labelled indicative and commercial WAIT/0R',async()=>{
 const h=app(spine());
 const {status,body}=await h.request();
 assert.equal(status,200);
 assert.equal(body.quote_integrity.status,'RESEARCH_ONLY');
 assert.equal(body.quote_integrity.license_verified,false);
 assert.equal(body.quote_integrity.mt5_broker_tick_verified,false);
 assert.equal(body.quote_integrity.execution_enabled,false);
 assert.equal(body.decision.action,'WAIT');
 assert.equal(body.decision.capital_permission,'0R');
 for(const k of ['gold','dxy','brent','us10y','eurusd','bitcoin']){
   const q=getAsset(body,k);
   assert.equal(q.quote_quality.quote_status,'FRESH_INDICATIVE');
   assert.equal(q.quote_quality.executable_quote_verified,false);
   assert.equal(q.quote_quality.redistribution_license_verified,false);
   assert.equal(q.capital_permission,'0R');
 }
 assert.equal(getAsset(body,'gold').quote_quality.source_label,'synthetic delayed indicator');
 assert.equal(body.gold_context.display_basis,'Gold futures fallback; NOT spot');
 assert.ok(h.calls.every(c=>c.method==='GET'));
});
test('stale 45-minute Gold quote never displays as current price or trade signal',async()=>{
 const h=app(spine({feed:{gold_futures:mk(4500,45)}}));
 const {body}=await h.request();
 const a=getAsset(body,'gold');
 assert.equal(a.price,null);
 assert.equal(a.last_observed_price,4500);
 assert.equal(a.state,'DATA_GATED');
 assert.equal(a.bias,'NEUTRAL');
 assert.equal(a.confidence_pct,0);
 assert.equal(a.quote_quality.quote_status,'STALE');
 assert.equal(body.market_status,'DATA_GATED');
 assert.equal(body.quote_integrity.status,'BLOCKED');
 assert.equal(body.decision.action,'WAIT');
});
test('missing Brent quote market_time blocks all portfolio capital permission',async()=>{
 const br=mk(85,1);delete br.market_time;
 const {body}=await app(spine({feed:{brent:br}})).request();
 assert.equal(getAsset(body,'brent').price,null);
 assert.equal(getAsset(body,'brent').quote_quality.quote_reason,'MISSING_OR_FUTURE_QUOTE_TIME');
 assert.equal(body.market_status,'DATA_GATED');
 assert.equal(body.decision.capital_permission,'0R');
});
test('DXY future timestamp beyond tolerated clock skew is invalid',async()=>{
 const {body}=await app(spine({feed:{dxy:mk(101,-4)}})).request();
 const dx=getAsset(body,'dxy');
 assert.equal(dx.quote_quality.quote_status,'UNVERIFIED');
 assert.equal(dx.price,null);
 assert.equal(body.quote_integrity.status,'BLOCKED');
});
test('stale XAUUSD spot is not silently disguised by a fresh COMEX futures price',async()=>{
 const {body}=await app(spine({feed:{
  gold_spot:{...mk(4350,68,'synthetic indicative spot'),quote_type:'spot_indicative'}
 }})).request();
 const gold=getAsset(body,'gold');
 assert.equal(gold.price,null);
 assert.equal(gold.last_observed_price,4350);
 assert.equal(gold.quote_quality.quote_status,'STALE');
 assert.equal(body.quote_integrity.gold_spot_basis,'SPOT_INDICATIVE');
 assert.equal(body.gold_context.display_basis,
   'Indicative XAUUSD spot; see quote status');
});
test('delayed 17-minute Brent quote remains historical, not labelled live',async()=>{
 const {body}=await app(spine({feed:{brent:mk(87,17)}})).request();
 const a=getAsset(body,'brent');
 assert.equal(a.quote_quality.quote_status,'DELAYED_INDICATIVE');
 assert.equal(a.price,null);
 assert.equal(a.last_observed_price,87);
 assert.equal(a.state,'DATA_GATED');
});
test('old BTC data is independently gated even if critical FX and oil quotes are recent',async()=>{
 const {body}=await app(spine({feed:{bitcoin:mk(92000,120)}})).request();
 assert.equal(body.quote_integrity.status,'RESEARCH_ONLY');
 assert.equal(getAsset(body,'bitcoin').price,null);
 assert.equal(getAsset(body,'bitcoin').quote_quality.quote_status,'STALE');
 assert.equal(getAsset(body,'gold').price,4400);
 assert.equal(body.decision.capital_permission,'0R');
});
test('gold market closed cannot be reclassified as trading LIVE because of quote timestamp',async()=>{
 const {body}=await app(spine({market_status:'MARKET_CLOSED'})).request();
 assert.equal(body.market_status,'DATA_GATED');
 assert.equal(body.quote_integrity.upstream_market_status,'MARKET_CLOSED');
 assert.equal(body.decision.action,'WAIT');
});
test('missing or zero quote price blocks saleable live badge despite a recent timestamp',async()=>{
 for(const invalidPrice of [0,null,-1,NaN]){
   const q=mk(invalidPrice,1);
   const {body}=await app(spine({feed:{brent:q}})).request();
   assert.equal(getAsset(body,'brent').quote_quality.quote_status,'UNVERIFIED');
   assert.equal(getAsset(body,'brent').price,null);
   assert.equal(body.quote_integrity.status,'BLOCKED');
 }
});
test('broker claim without verified recent tick does not become executable quote',async()=>{
 const {body}=await app(spine({
   market_status:'BROKER_LIVE',broker_state:'BROKER_LIVE',broker_age:80,
   feed:{gold_spot:{...mk(4330,1),quote_type:'broker_live_read_only'}}
 })).request();
 assert.equal(body.quote_integrity.mt5_broker_tick_verified,false);
 assert.equal(body.quote_integrity.execution_enabled,false);
 assert.equal(body.decision.capital_permission,'0R');
});
test('even synthetic fresh read-only MT5 broker tick cannot unlock automatic trading',async()=>{
 const {body}=await app(spine({
   market_status:'BROKER_LIVE',broker_state:'BROKER_LIVE',broker_age:1,
   feed:{gold_spot:{...mk(4330,1),quote_type:'broker_live_read_only'}}
 })).request();
 assert.equal(body.quote_integrity.mt5_broker_tick_verified,true);
 assert.equal(body.quote_integrity.execution_enabled,false);
 assert.equal(body.decision.action,'WAIT');
 assert.equal(body.decision.capital_permission,'0R');
});
test('upstream market failure returns HTTP 503 no-store and zero market permission',async()=>{
 const h=app(spine(),{upstreamError:true});
 const res=await h.request();
 assert.equal(res.status,503);
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.equal(res.body.market_status,'UNAVAILABLE');
 assert.equal(res.body.decision.action,'WAIT');
 assert.equal(res.body.decision.capital_permission,'0R');
 assert.deepEqual(res.body.assets,[]);
});
test('HTTP method denial creates no provider request',async()=>{
 const h=app(spine());
 const res=await h.request('POST');
 assert.equal(res.status,405);
 assert.equal(h.calls.length,0);
});
