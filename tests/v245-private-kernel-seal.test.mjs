import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifySealWithHedge} from '../supabase/functions/runtime-v180-continuous-kernel/v245-seal-hedge.mjs';
const seal=transport=>({sealed:true,version:'v180.6',transport});
test('fast verified SQL path avoids adding REST traffic',async()=>{
 let invoked=0;
 const result=await verifySealWithHedge({pooler:async()=>seal('SQL_POOLER_VERIFIED'),rest:async()=>{invoked++;return seal('POSTGREST_VERIFIED')},hedgeDelayMs:12});
 assert.equal(result.transport,'SQL_POOLER_VERIFIED');
 assert.equal(invoked,0);
});
test('pooler transport failure requires positive REST seal',async()=>{
 const result=await verifySealWithHedge({pooler:async()=>{throw Error('ECONNREFUSED')},rest:async()=>seal('POSTGREST_VERIFIED'),hedgeDelayMs:1});
 assert.equal(result.sealed,true);
 assert.equal(result.transport,'POSTGREST_VERIFIED');
});
test('slow pooler triggers hedged REST, explicit negative blocks a positive result',async()=>{
 await assert.rejects(()=>verifySealWithHedge({
  pooler:()=>new Promise(r=>setTimeout(()=>r(seal('SQL_POOLER_VERIFIED')),16)),
  rest:async()=>({sealed:false}),hedgeDelayMs:1
 }),/v180_kernel_security_seal_missing/);
});
test('dual transport outage remains fail closed',async()=>{
 await assert.rejects(()=>verifySealWithHedge({
  pooler:()=>new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),12)),
  rest:async()=>{throw Error('rest_timeout')},hedgeDelayMs:1
 }),/DATABASE_SEAL_TRANSPORT_TIMEOUT/);
});
test('fast explicit negative never starts REST fallback',async()=>{
 let restCalls=0;
 await assert.rejects(()=>verifySealWithHedge({
  pooler:async()=>{throw Error('v180_kernel_security_seal_missing')},
  rest:async()=>{restCalls++;return seal('POSTGREST_VERIFIED')},
  hedgeDelayMs:30
 }),/v180_kernel_security_seal_missing/);
 assert.equal(restCalls,0);
});
test('slow REST positive cannot override a negative SQL verdict',async()=>{
 await assert.rejects(()=>verifySealWithHedge({
  pooler:()=>new Promise(r=>setTimeout(()=>r({sealed:false}),9)),
  rest:async()=>seal('POSTGREST_VERIFIED'),hedgeDelayMs:1
 }),/v180_kernel_security_seal_missing/);
});
test('slow SQL verifies if REST transport fails without invented green',async()=>{
 const result=await verifySealWithHedge({
  pooler:()=>new Promise(r=>setTimeout(()=>r(seal('SQL_POOLER_VERIFIED')),8)),
  rest:async()=>{throw Error('rest_unreachable')},hedgeDelayMs:1
 });
 assert.equal(result.transport,'SQL_POOLER_VERIFIED');
});
test('private kernel keeps separate JWT/OIDC, sealed DB and WAIT/0R controls',()=>{
 const src=readFileSync(new URL('../supabase/functions/runtime-v180-continuous-kernel/index.ts',import.meta.url),'utf8');
 assert.match(src,/if\(!\(await authorized\(req\)\)\)/);
 assert.match(src,/verifySealWithHedge/);
 assert.match(src,/command_kernel_seal_status/);
 assert.match(src,/capital_permission:'0R'/);
 assert.match(src,/external_execution:false/);
 assert.match(src,/return Response\.json\(\{[\s\S]*?state:'FAIL_CLOSED'/);
});
