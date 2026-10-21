import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
import {evaluateLaunchReadiness} from '../src/launch-readiness.mjs';
const NOW=Date.parse('2026-10-21T09:00:00Z');
const at=new Date(NOW-1000).toISOString();
const broker=()=>({httpOk:true,data:{ok:true,live_broker:{state:'BROKER_LIVE',
  quote:{observed_at:at,age_seconds:1,bid:4200,mid:4200.5,ask:4201}}}});
const indicative=()=>({httpOk:true,data:{ok:true,feed:{gold_spot:{
  symbol:'XAUUSD',currency:'USD',price:4200,market_time:at,quote_type:'spot_indicative',source:'Public reference'}}}});
test('fresh real read-only broker tick is preserved and never gets trading permission',()=>{
 const r=curatePublicGold({broker:broker()},NOW);
 assert.equal(r.ok,true);assert.equal(r.market_status,'BROKER_LIVE');
 assert.equal(r.live_broker.state,'BROKER_LIVE');
 assert.equal(r.governance.action_permitted,'WAIT');assert.equal(r.governance.capital_permission,'0R');
 assert.equal(r.governance.live_order_submission_enabled,false);
});
test('fresh indicative spot can be displayed but cannot certify broker or launch',()=>{
 const r=curatePublicGold({broker:{httpOk:false},reference:indicative()},NOW);
 assert.equal(r.market_status,'INDICATIVE_RESEARCH');
 assert.equal(r.live_broker.state,'NOT_VERIFIED');
 assert.equal(r.feed.gold_spot.quote_type,'spot_indicative');
 const proof={response:{ok:true},data:r};
 assert.equal(evaluateLaunchReadiness({gold:proof},NOW).checks.public_gold_data,false);
});
test('stale, forged, missing and future indicative prices are withheld',()=>{
 for(const mutate of [
   x=>{x.data.feed.gold_spot.market_time=new Date(NOW-16*60000).toISOString();},
   x=>{x.data.feed.gold_spot.market_time=new Date(NOW+60000).toISOString();},
   x=>{x.data.feed.gold_spot.price=0;},
   x=>{x.data.feed.gold_spot.price='4200';},
   x=>{x.data.feed.gold_spot.quote_type='broker_live_read_only';},
   x=>{x.data.feed.gold_spot.symbol='GC=F';}
 ]){const source=indicative();mutate(source);
   assert.equal(curatePublicGold({reference:source},NOW).ok,false);
 }
});
test('stale broker does not get certified, indicative remains separate',()=>{
 const bad=broker();
 bad.data.live_broker.quote.observed_at=new Date(NOW-100000).toISOString();
 const r=curatePublicGold({broker:bad,reference:indicative()},NOW);
 assert.equal(r.market_status,'INDICATIVE_RESEARCH');
 assert.equal(r.live_broker.state,'NOT_VERIFIED');
 assert.equal(r.governance.capital_permission,'0R');
});
test('fixed-path API does not depend on query args or expose dynamic upstream targets',()=>{
 const api=readFileSync(new URL('../api/public-gold-read.js',import.meta.url),'utf8');
 assert.match(api,/public-gold-live-xauusd/);
 assert.match(api,/public-gold-live-api/);
 assert.match(api,/curatePublicGold/);
 assert.doesNotMatch(api,/req\.url|req\.query|url\.searchParams|apiKey|service_role|checkout_url/);
 assert.match(api,/res\.status\(503\)/);
});
test('all public user surfaces use the same queryless Gold gateway',()=>{
 const gold=readFileSync(new URL('../src/public-gold-launch.mjs',import.meta.url),'utf8');
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 for(const s of [gold,checkout,status])assert.match(s,/\/api\/public-gold-read/);
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(status,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
});
