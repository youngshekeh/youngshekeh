import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedPublicReferences} from '../src/v235-reference-integrity.mjs';
const NOW=Date.parse('2026-10-22T08:40:00Z'),at=new Date(NOW-2000).toISOString();
function sample(){return{ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},
 assets:{gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',
 price:4089.3,source_updated_at:at,broker_verified:false,execution_quote:false},
 bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',
 price:82182.7,observed_at:at,source_updated_at:null,broker_verified:false,execution_quote:false}}}}
test('two attributed public spot references cannot activate broker trading',()=>{
 const refs=verifiedPublicReferences(sample(),NOW);
 assert.equal(refs.count,2);assert.equal(refs.gold.value,4089.3);
 assert.equal(refs.gold.label,'INDICATIVE SPOT');
 assert.equal(refs.bitcoin.time_type,'receipt');
});
test('stale, future, zero, fabricated source timestamps and permission promotion rejected',()=>{
 for(const change of [
   d=>d.assets.gold.price=0,
   d=>d.assets.gold.source_updated_at=new Date(NOW-130000).toISOString(),
   d=>d.assets.gold.source_updated_at=new Date(NOW+12000).toISOString(),
   d=>d.assets.gold.type='BROKER_LIVE',
   d=>d.assets.gold.broker_verified=true,
 ]){
   const p=sample();change(p);assert.equal(verifiedPublicReferences(p,NOW).gold,null);
 }
 const p=sample();p.governance.capital_permission='1R';
 assert.equal(verifiedPublicReferences(p,NOW).count,0);
 const q=sample();q.assets.bitcoin.source_updated_at=at;
 assert.equal(verifiedPublicReferences(q,NOW).bitcoin,null);
 const s=sample();s.assets.bitcoin.observed_at=new Date(NOW-45000).toISOString();
 assert.equal(verifiedPublicReferences(s,NOW).bitcoin,null);
});
test('private kernel and market reference lanes separate, no fabricated breadth',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const src=readFileSync(new URL('../src/v235-public-board.mjs',import.meta.url),'utf8');
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.match(html,/class="editorial-evidence-panel"/);
 assert.doesNotMatch(html,/class="command-radar"/);
 assert.match(html,/src="\/src\/v235-public-board.mjs"/);
 assert.match(readFileSync(new URL('../src/public-market-reference.mjs',import.meta.url),'utf8'),/api\\/public-market-reference/);
 assert.match(src,/addEventListener\\('tfa:public-references'/);
 assert.match(src,/CORE BREADTH UNVERIFIED/);
 assert.match(src,/0\/7 CORE/);
 assert.match(main,/SOURCE UNAVAILABLE/);
 assert.match(main,/AbortSignal\.timeout\(12_000\)/);
 assert.match(readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
