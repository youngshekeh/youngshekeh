import test from 'node:test';
import assert from 'node:assert/strict';
import {readEye} from '../api/directional-eye.js';
test('provider outage emits unavailable research packet with zero capital permission',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('fixture outage')};
 try{const r=await readEye();assert.equal(r.assets.length,8);assert.ok(r.assets.every(x=>x.state==='UNAVAILABLE'));assert.equal(r.live_orders,false);assert.equal(r.capital_permission,'0R');}finally{globalThis.fetch=original;}
});
test('valid source candles reach Bitcoin detector without granting execution',async()=>{
 const now=Date.UTC(2026,9,23,12);const original=globalThis.fetch;
 globalThis.fetch=async url=>{const step=Number(new URL(url).searchParams.get('granularity'))*1000;return {ok:true,json:async()=>Array.from({length:65},(_,i)=>[(now-(65-i)*step)/1000,99,101,100,100,10]).reverse()};};
 try{const r=await readEye(now);const b=r.assets.find(x=>x.asset==='Bitcoin');assert.notEqual(b.state,'UNAVAILABLE');assert.equal(b.source,'Coinbase Exchange BTC-USD');assert.equal(b.probability,null);assert.equal(b.capital_permission,'0R');assert.equal(r.ledger_status,'NO_CANONICAL_WRITE');}finally{globalThis.fetch=original;}
});
