import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {curateGoldReference,curateBitcoinReference,curatePublicReferences} from '../src/public-market-reference-data.mjs';
import handler from '../api/public-market-reference.js';
const NOW=Date.parse('2026-10-22T07:40:00Z');
const gold=()=>({symbol:'XAU',currency:'USD',price:4100.5,updatedAt:new Date(NOW-1000).toISOString()});
const btc=()=>({data:{base:'BTC',currency:'USD',amount:'82000.15'}});
test('Gold is a timestamped positive indicative spot reference, never a broker quote',()=>{
 const g=curateGoldReference(gold(),NOW);
 assert.equal(g.price,4100.5);assert.equal(g.type,'INDICATIVE_SPOT');
 assert.equal(g.broker_verified,false);assert.equal(g.execution_quote,false);
});
test('Gold source validation rejects stale, future, negative, missing or wrong currency',()=>{
 for(const bad of [
  {...gold(),price:0},{...gold(),price:null},{...gold(),price:NaN},
  {...gold(),currency:'NGN'},{...gold(),symbol:'GC=F'},
  {...gold(),updatedAt:new Date(NOW-130000).toISOString()},
  {...gold(),updatedAt:new Date(NOW+15000).toISOString()},
  {...gold(),updatedAt:'garbage'}
 ])assert.equal(curateGoldReference(bad,NOW),null);
});
test('BTC is explicitly receipt timestamped, not an invented source observation',()=>{
 const b=curateBitcoinReference(btc(),NOW);
 assert.equal(b.price,82000.15);assert.equal(b.source_updated_at,null);
 assert.equal(b.type,'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED');
 assert.equal(b.execution_quote,false);
 for(const bad of [{data:{base:'ETH',currency:'USD',amount:'45'}},{data:{base:'BTC',currency:'EUR',amount:'2'}},{data:{base:'BTC',currency:'USD',amount:'0'}}])
   assert.equal(curateBitcoinReference(bad,NOW),null);
});
test('partial provider outages still return only verified references',()=>{
 const b=curateBitcoinReference(btc(),NOW);
 const result=curatePublicReferences({bitcoin:b},NOW);
 assert.equal(result.ok,true);assert.equal(result.state,'PARTIAL_REFERENCES');
 assert.equal(result.assets.gold,null);assert.equal(result.governance.capital_permission,'0R');
 const down=curatePublicReferences({},NOW);assert.equal(down.ok,false);
});
function mockRes(){const headers={};return {headers,setHeader(k,v){headers[k]=v;},
 status(code){this.code=code;return this;},json(value){this.body=value;return this}}}
test('independent endpoint forbids writes and never forwards request credentials',async()=>{
 const backup=globalThis.fetch;let captured=[];
 globalThis.fetch=async(url,opts)=>{captured.push({url,opts});return {ok:true,json:async()=>url.includes('gold-api')?gold():btc()}};
 try{
  const post=mockRes();await handler({method:'POST',headers:{authorization:'secret'}},post);
  assert.equal(post.code,405);assert.equal(captured.length,0);
  assert.equal(post.body.governance.live_order_submission_enabled,false);
  // Mock source time is in past relative to wall clock; price may be gated but requests must be fixed.
  const get=mockRes();await handler({method:'GET',headers:{authorization:'secret',cookie:'private'}},get);
  assert.equal(captured.length,2);
  for(const p of captured){
   assert.ok(p.url==='https://api.gold-api.com/price/XAU'||p.url==='https://api.coinbase.com/v2/prices/BTC-USD/spot');
   assert.equal(p.opts.headers.Authorization,undefined);assert.equal(p.opts.headers.cookie,undefined);
   assert.equal(p.opts.method,'GET');
  }
  assert.equal(get.body.governance.capital_permission,'0R');
 }finally{globalThis.fetch=backup}
});
test('homepage has a non-animated editorial market panel and no fabricated placeholders',()=>{
 const home=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(home,/id="public-market-reference"/);
 assert.match(home,/id="pmr-gold"/);assert.match(home,/id="pmr-btc"/);
 assert.match(home,/src="\/src\/public-market-reference.mjs"/);
 assert.doesNotMatch(home,/class="dimension-stage"/);
});
