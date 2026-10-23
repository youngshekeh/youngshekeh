import test from 'node:test';
import assert from 'node:assert/strict';
import {curateBook,currentBook} from '../src/bitcoin-liquidity-core.mjs';
import {readLiquidity} from '../api/bitcoin-liquidity.js';
const now=Date.UTC(2026,9,23,12);
const book=()=>({time:new Date(now).toISOString(),sequence:123,auction_mode:false,bids:[['100','2',8],['99','3',2]],asks:[['101','1',2],['102','2',1]]});
test('aggregated size is not multiplied by order count; spread and visible depth are measured',()=>{
 const p=curateBook(book(),now);assert.equal(p.status,'OBSERVED_SNAPSHOT');assert.equal(p.snapshot.bid_depth_usd,497);assert.equal(p.snapshot.ask_depth_usd,305);assert.equal(p.snapshot.spread_usd,1);assert.equal(p.snapshot.visible_imbalance,192/802);assert.equal(p.capital_permission,'0R');assert.equal(p.live_orders,false);
});
test('stale, future, missing time, crossed books, unsorted and malformed depth are withheld',()=>{
 for(const mutate of [b=>b.time=new Date(now-30001).toISOString(),b=>b.time=new Date(now+2001).toISOString(),b=>delete b.time,b=>b.asks[0][0]='99',b=>b.bids.reverse(),b=>b.bids[0][1]='-1',b=>b.sequence=0,b=>b.auction_mode=true]){const b=book();mutate(b);assert.equal(curateBook(b,now).status,'UNAVAILABLE');}
});
test('snapshot clears at source expiry and cannot extend or bypass governance',()=>{
 const p=curateBook(book(),now);assert.ok(currentBook(p,now+29999));assert.equal(currentBook(p,now+30000),null);
 assert.equal(currentBook({...p,live_orders:true},now),null);assert.equal(currentBook({...p,snapshot:{...p.snapshot,expires_at:new Date(now+40000).toISOString()}},now),null);
});
test('depth covers nearest 20 levels and never counts distant unreported liquidity',()=>{
 const b=book();b.bids=Array.from({length:25},(_,i)=>[String(100-i),'1',1]);b.asks=Array.from({length:25},(_,i)=>[String(101+i),'1',1]);const p=curateBook(b,now);assert.equal(p.snapshot.bid_levels,20);assert.equal(p.snapshot.bid_depth_usd,1810);
});
test('read-only adapter handles valid source, HTTP failure and oversized body',async()=>{
 assert.equal((await readLiquidity({fetcher:async()=>new Response(JSON.stringify(book())),clock:()=>now})).status,'OBSERVED_SNAPSHOT');
 assert.equal((await readLiquidity({fetcher:async()=>new Response('',{status:503})})).reason,'PROVIDER_HTTP_ERROR');
 assert.equal((await readLiquidity({fetcher:async()=>new Response('x'.repeat(2000001))})).reason,'PAYLOAD_TOO_LARGE');
 assert.equal((await readLiquidity({fetcher:async()=>new Response('bad json')})).reason,'INVALID_JSON');
});
