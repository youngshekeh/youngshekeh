import test from 'node:test';
import assert from 'node:assert/strict';
import {createEyeReadGate,EYE_CACHE_TTL_MS} from '../api/directional-eye.js';
const packet=t=>({version:'directional-eye-v1',generated_at:new Date(t).toISOString(),research_only:true,live_orders:false,capital_permission:'0R'});
test('concurrent readers share one provider request and preserve original timestamp',async()=>{
 let t=Date.UTC(2026,9,23,12),count=0,release;
 const gate=createEyeReadGate({now:()=>t,read:()=>{count++;return new Promise(r=>release=r);}});
 const a=gate(),b=gate();assert.equal(count,1);release(packet(t));
 const [first,second]=await Promise.all([a,b]);assert.equal(first,second);
 t+=5000;assert.equal(await gate(),first);assert.equal(count,1);
 t+=EYE_CACHE_TTL_MS;assert.equal((await gate()).generated_at,new Date(t).toISOString());assert.equal(count,2);
});
test('failed upstream read is not cached or reported as a successful packet',async()=>{
 let count=0;const t=Date.UTC(2026,9,23,12);
 const gate=createEyeReadGate({now:()=>t,read:async()=>{if(++count===1)throw Error('offline');return packet(t);}});
 await assert.rejects(gate());assert.equal((await gate()).capital_permission,'0R');assert.equal(count,2);
});
test('malformed or execution-enabled packets fail closed',async()=>{
 const t=Date.UTC(2026,9,23,12);
 for(const bad of [{...packet(t),live_orders:true},{...packet(t),capital_permission:'1R'},packet(t-61000)]){
  const gate=createEyeReadGate({now:()=>t,read:async()=>bad});await assert.rejects(gate());
 }
});
