import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {verifyPublicGoldQuote} from '../src/public-gold-evidence.mjs';
import {evaluateLaunchReadiness} from '../src/launch-readiness.mjs';
const now = Date.parse('2026-10-21T04:00:00Z');
const fresh = new Date(now - 1000).toISOString();
const good = () => ({response:{ok:true},data:{ok:true,live_broker:{
  state:'BROKER_LIVE',quote:{observed_at:fresh,age_seconds:1,bid:4200,mid:4200.5,ask:4201}
}}});
test('a real fresh bid/ask broker observation can qualify as public Gold data evidence',()=>{
  assert.equal(verifyPublicGoldQuote(good(),now).verified,true);
});
test('missing Gold evidence is a mandatory fail-closed launch blocker',()=>{
  const r = evaluateLaunchReadiness({},now);
  assert.equal(r.checks.public_gold_data,false);
  assert.ok(r.blockers.includes('public_gold_data'));
});
test('a public reference is never promoted to broker-live proof',()=>{
  const g=good();
  g.data.live_broker.state='INDICATIVE';
  g.data.feed={gold_spot:{price:4200,market_time:fresh,source:'SPOT',quote_type:'indicative'}};
  assert.equal(verifyPublicGoldQuote(g,now).verified,false);
});
test('HTTP 200 with upstream failure or stale quote fails closed',()=>{
  for(const mutate of [
    v=>{v.response.ok=false;},
    v=>{v.data.ok=false;},
    v=>{v.data.live_broker.quote.observed_at=new Date(now-6000).toISOString();},
    v=>{v.data.live_broker.quote.observed_at=new Date(now+6000).toISOString();},
    v=>{v.data.live_broker.quote.age_seconds=6;},
    v=>{v.data.live_broker.quote.age_seconds='0';},
    v=>{v.data.live_broker.quote.age_seconds=-1;},
    v=>{v.data.live_broker.quote.mid=0;},
    v=>{v.data.live_broker.quote.mid=4210;},
    v=>{v.data.live_broker.quote.ask=null;}
  ]){
    const v=good();mutate(v);
    assert.equal(verifyPublicGoldQuote(v,now).verified,false,JSON.stringify(v));
  }
});
test('production status fetches Gold independently while paid checkout remains locked',()=>{
  const status=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
  const html=readFileSync(new URL('../status/index.html',import.meta.url),'utf8');
  const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
  assert.match(status,/Promise\.allSettled/);
  assert.match(status,/market-feed\?feed=public-gold-live-xauusd/);
  assert.match(status,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
  assert.match(html,/id="gold"/);
  assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
