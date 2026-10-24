import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {researchReadDeadline,createResearchTransport} from '../src/research-transport.mjs';
test('only the two measured slow scheduler readers receive a larger fixed deadline',()=>{
 for(const path of ['/api/connection-pressure-shadow','/api/peak-minute-spreader-status']){
  assert.equal(researchReadDeadline(path),40000);
  assert.equal(researchReadDeadline(path+'?status=1'),40000);
 }
 for(const path of ['/api/gold-live-price','/api/gold-mtf-zones','/api/autonomous-state',
  '/api/public-market-reference','/api/connection-pressure-shadow-extra','/api/ops-heartbeat']){
  assert.equal(researchReadDeadline(path),20000);
  assert.equal(researchReadDeadline(path,15),15);
 }
});
test('outer deadlines leave room for SQL, Edge auth, and a truthful bounded result',()=>{
 const root=new URL('../',import.meta.url);
 for(const [bridge,edge] of [
  ['api/connection-pressure-shadow.js','supabase/functions/runtime-v147-connection-pressure-shadow/index.ts'],
  ['api/peak-minute-spreader-status.js','supabase/functions/runtime-v1461-peak-spreader-status/index.ts']
 ]){
  const b=readFileSync(new URL(bridge,root),'utf8'),e=readFileSync(new URL(edge,root),'utf8');
  assert.match(b,/AbortSignal\.timeout\(35000\)/);
  assert.match(e,/AbortSignal\.timeout\(26000\)/);
  assert.match(e,/if\(!\(await authorized\(req\)\)\)/);
  assert.match(b,/getVercelOidcToken/);
  assert.match(e,/unauthorized_private_runtime/);
  assert.match(e,/capital_permission:'0R'/);
  assert.doesNotMatch(e,/retry\(|cron\.(alter_job|schedule|unschedule)/);
 }
 assert.ok(25000<26000&&26000+5000<35000&&35000<38000&&38000<40000);
 const hosting=JSON.parse(readFileSync(new URL('vercel.json',root),'utf8'));
 // The public read-only feed has an independent 20s function cap and does not
 // inherit the privileged scheduler's longer 40s diagnostic budget.
 assert.deepEqual(hosting.functions,{
  'api/market-feed.js':{maxDuration:20},
  'api/public-recovery-triage.js':{maxDuration:20},
  'api/connection-pressure-shadow.js':{maxDuration:40},
  'api/peak-minute-spreader-status.js':{maxDuration:40}
 });
});
test('operator cancellation still stops a long diagnostic without certifying recovery',async()=>{
 const controller=new AbortController();let started=false;
 const transport=createResearchTransport({fetchImpl:(_path,{signal})=>new Promise((_,reject)=>{
  started=true;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 })});
 const task=transport.request('/api/connection-pressure-shadow',{signal:controller.signal});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started,true);controller.abort();
 const result=await task;assert.equal(result.status,503);
 const body=await result.json();assert.equal(body.governance.capital_permission,'0R');
 assert.equal(body.governance.live_order_submission_enabled,false);
});
test('SQL repair preserves all existing source and access boundaries',()=>{
 const sql=readFileSync(new URL('../supabase/recovery/v261-scheduler-query-repair.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/from cron\.job_run_details/g)||[]).length,2);
 assert.equal((sql.match(/md5\(pg_get_functiondef/g)||[]).length,2);
 assert.match(sql,/with history as materialized/);
 assert.match(sql,/where start_time>=least\(v_applied_at,v_now-interval '60 minutes'\)/);
 assert.match(sql,/CONNECTION_PRESSURE_SHADOW_NOT_TRADING_PERMISSION/);
 const statements=sql.replace(/--[^\n]*/g,'');
 assert.doesNotMatch(statements,/\b(?:alter\s+(?:role|system)|grant\s|revoke\s|cron\.(?:alter_job|schedule|unschedule)\s*\(|delete\s+from|truncate\s|drop\s)/i);
 const fixtures=readFileSync(new URL('../supabase/recovery/v261-scheduler-query-fixtures.sql',import.meta.url),'utf8');
 for(const [start,end] of [
  ['  with history as materialized','\n  select coalesce(jsonb_agg(\n    jsonb_build_object('],
  ['  with r60 as materialized','\n  select coalesce(jsonb_agg(x)']
 ]){
  const offset=sql.indexOf(start);
  const query=sql.slice(offset,sql.indexOf(end,offset)).trim()
   .replace(/\n  into[\s\S]*?;$/,'').replace('from cron.job_run_details','from fixture')
   .replaceAll('v_now',"'2026-10-23 22:00:00+00'::timestamptz")
   .replaceAll('v_applied_at',"'2026-10-23 21:00:00+00'::timestamptz");
  assert.ok(query.length>1000);
  assert.ok(fixtures.includes(query),'PostgreSQL fixtures must exercise the actual repaired expressions');
 }
 const rollback=readFileSync(new URL('../supabase/recovery/v261-scheduler-query-repair-rollback.sql',import.meta.url),'utf8');
 assert.equal((rollback.match(/md5\(pg_get_functiondef/g)||[]).length,2);
});
