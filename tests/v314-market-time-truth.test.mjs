import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {enforceQuoteTimeTruth} from '../src/v314-market-time-truth.mjs';

const NOW=Date.parse('2026-10-27T02:30:00.000Z');
const earlier=m=>new Date(NOW-m*60_000).toISOString();
const ahead=m=>new Date(NOW+m*60_000).toISOString();
const q=(m=1,price=100)=>({price,market_time:earlier(m),source:'DELAYED_TEST_FEED'});
const gold=()=>({
  ok:true,market_status:'LIVE_BETA',generated_at:earlier(1),
  feed:{gold_futures:q(),dxy:q(),brent:q()},
  engine:{state:'HERO_REPAIR',action:'EVALUATE',
    capital_permission:'MAX_0.25R',confidence_pct:77}
});
const live=()=>({
  ok:true,market_status:'LIVE_BETA',generated_at:earlier(1),
  assets:[
    {key:'gold',...q(),action:'EVALUATE',capital_permission:'MAX_0.25R'},
    {key:'dxy',...q()},{key:'brent',...q()}
  ],
  decision:{action:'EVALUATE',capital_permission:'MAX_0.25R'},
  regime:{state:'RISK_ON',score:3,drivers:['test']}
});

test('fresh required quotes remain unmodified and receive honest bounded freshness marker',()=>{
  const input=gold();const before=structuredClone(input);
  const out=enforceQuoteTimeTruth('public-gold-live-api',input,NOW);
  assert.equal(out.market_status,'LIVE_BETA');
  assert.equal(out.engine.action,'EVALUATE');
  assert.equal(out.proxy_freshness.state,'QUOTE_TIMESTAMPS_WITHIN_30M');
  assert.deepEqual(input,before);
});
test('missing futures timestamp gates Gold rather than inferring freshness from DXY',()=>{
  const x=gold();delete x.feed.gold_futures.market_time;
  const out=enforceQuoteTimeTruth('public-gold-live-api',x,NOW);
  assert.equal(out.market_status,'STALE');
  assert.equal(out.engine.action,'WAIT');
  assert.equal(out.engine.capital_permission,'0R');
  assert.equal(out.engine.confidence_pct,0);
  assert.equal(out.engine.stale_data,true);
});
test('aged Brent quote cannot be classified as live even if HTTP body says ok',()=>{
  const x=gold();x.feed.brent.market_time=earlier(31);
  const out=enforceQuoteTimeTruth('public-gold-live-api',x,NOW);
  assert.equal(out.market_status,'STALE');
  assert.equal(out.proxy_freshness.reason,'MISSING_INVALID_OR_AGED_QUOTE');
});
test('future quote and nonsensical price fail closed',()=>{
  for(const quote of [{price:100,market_time:ahead(5)},q(1,-5)]){
    const x=gold();x.feed.dxy=quote;
    assert.equal(enforceQuoteTimeTruth('public-gold-live-api',x,NOW).market_status,'STALE');
  }
});
test('a newly regenerated wrapper cannot hide an old source body timestamp',()=>{
  const x=gold();x.generated_at=earlier(10);
  const out=enforceQuoteTimeTruth('public-gold-live-api',x,NOW);
  assert.equal(out.market_status,'STALE');
  assert.equal(out.proxy_freshness.reason,'STALE_UPSTREAM_RESPONSE_TIMESTAMP');
});
test('LIVE market asset feed gates all account-level actions when Brent is missing',()=>{
  const x=live();x.assets=x.assets.filter(a=>a.key!=='brent');
  const out=enforceQuoteTimeTruth('public-live-markets-api',x,NOW);
  assert.equal(out.market_status,'STALE');
  assert.equal(out.decision.action,'WAIT');
  assert.equal(out.decision.capital_permission,'0R');
  assert.equal(out.regime.state,'DATA_GATED');
  assert.equal(out.assets.find(a=>a.key==='gold').action,'WAIT');
});
test('already-unavailable upstream remains unavailable rather than cosmetically green',()=>{
  const x=live();x.market_status='UNAVAILABLE';
  const out=enforceQuoteTimeTruth('public-live-markets-api',x,NOW);
  assert.equal(out.market_status,'UNAVAILABLE');
  assert.equal(out.decision.capital_permission,'0R');
});
test('market-closed quotes never impersonate an open live session',()=>{
  const x=gold();x.market_status='MARKET_CLOSED';x.feed.gold_futures.market_time=earlier(600);
  const out=enforceQuoteTimeTruth('public-gold-live-api',x,NOW);
  assert.equal(out.market_status,'MARKET_CLOSED');
  assert.equal(out.engine.action,'WAIT');
  assert.equal(out.engine.capital_permission,'0R');
});
test('unknown market statuses are not automatically accepted as LIVE',()=>{
  const x=live();x.market_status='EXECUTABLE';
  assert.equal(enforceQuoteTimeTruth('public-live-markets-api',x,NOW).market_status,'STALE');
});
test('unrelated public report feeds pass through unchanged',()=>{
  const x={ok:true,generated_at:earlier(600),report:null};
  assert.equal(enforceQuoteTimeTruth('latest-global-markets',x,NOW),x);
});
test('public proxy retains fixed feed allowlist, bounded timeout and noncacheable response',()=>{
  const source=readFileSync(new URL('../api/market-feed.js',import.meta.url),'utf8');
  assert.match(source,/enforceQuoteTimeTruth\(feed,body\)/);
  assert.match(source,/PUBLIC_FEED_DEADLINE_MS=10_500/);
  assert.match(source,/url\.searchParams\.getAll\('feed'\)\.length!==1/);
  assert.match(source,/res\.setHeader\('Cache-Control','no-store'\)/);
  assert.match(source,/X-TFA-Quote-Time-State/);
});
