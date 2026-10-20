import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../supabase/functions/runtime-v180-continuous-kernel/index.ts',import.meta.url),'utf8');
const shell=readFileSync(new URL('../api/ops-heartbeat.js',import.meta.url),'utf8');
test('V208 private database pooler has a single bounded connection',()=>{
 assert.match(source,/import postgres from "npm:postgres@3\.4\.7"/);
 assert.match(source,/Deno\.env\.get\('SUPABASE_DB_URL'\)/);
 assert.match(source,/6543\/postgres/);
 assert.match(source,/max:1,prepare:false,fetch_types:false,connect_timeout:4/);
 assert.match(source,/await client\.end\(\{timeout:1\}\)/);
});
test('both paths require actual database seal, not a cached flag',()=>{
 assert.match(source,/client\x60select public\.command_kernel_seal_status\(\) as seal\x60/);
 assert.match(source,/const seal:any=await rpc\('command_kernel_seal_status',\{\},SEAL_DEADLINE_MS\)/);
 const count=(source.match(/if\(!seal\?\.sealed\)throw new Error\('v180_kernel_security_seal_missing'\)/g)||[]).length;
 assert.equal(count,2);
 assert.match(source,/if\(String\(error\)\.includes\('v180_kernel_security_seal_missing'\)\)throw error/);
 assert.match(source,/const seal=await requireKernelSeal\(\)/);
});
test('pooler query remains deadline-bound and does not accumulate connections',()=>{
 assert.match(source,/seal_pooler_deadline/);
 assert.match(source,/setTimeout\(\(\)=>reject\(new Error\('seal_pooler_deadline'\)\),9000\)/);
 assert.match(source,/clearTimeout\(timer\)/);
 assert.match(shell,/KERNEL,oidc,70000/);
});
test('OIDC, owner leases and zero-capital firewall are unchanged',()=>{
 assert.match(source,/if\(!\(await authorized\(req\)\)\)/);
 assert.match(source,/if\(!SERVICE_ROLE\)/);
 assert.match(source,/Authorization:auth/);
 assert.match(source,/command_kernel_begin_run/);
 assert.match(source,/command_kernel_finish_run/);
 assert.match(source,/trades_sent:false/);
 assert.match(source,/external_execution:false/);
 assert.match(source,/action_permitted:'WAIT'/);
 assert.match(source,/capital_permission:'0R'/);
 assert.match(shell,/database_scheduler:\{changed:false/);
 assert.doesNotMatch(source,/ALTER SYSTEM|cron\.launch_active_jobs|pg_terminate_backend|drop table/i);
});
test('private database URL never serialized in response payloads',()=>{
 assert.doesNotMatch(source,/(DB_URL|pooler\.password|SERVICE_ROLE)\s*[:,]\s*(DB_URL|pooler\.password|SERVICE_ROLE)/);
 assert.match(source,/transport:'SQL_POOLER_VERIFIED'/);
 assert.match(source,/transport:'POSTGREST_VERIFIED'/);
});
