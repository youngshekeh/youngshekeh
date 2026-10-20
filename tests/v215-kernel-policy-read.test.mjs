import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=file('supabase/functions/runtime-v180-continuous-kernel/index.ts');
test('read-only existing V180 policy is owner-bound and bounded',()=>{
 assert.match(src,/async function readExistingPolicy\(userId:string\)/);
 assert.match(src,/client\x60select user_id,policy_key,heartbeat_minutes,stale_run_minutes,max_dispatch_attempts,/);
 assert.match(src,/from public\.command_ops_kernel_policies\s+where user_id=\$\{userId\} and policy_key='DEFAULT_V180' limit 1/);
 assert.match(src,/max:1,prepare:false,fetch_types:false,connect_timeout:4/);
 assert.match(src,/policy_pooler_deadline/);
 assert.match(src,/await client\.end\(\{timeout:1\}\)/);
});
test('policy identity and every numeric safety threshold are checked',()=>{
 assert.match(src,/policy\?\.user_id===userId&&policy\?\.policy_key==='DEFAULT_V180'/);
 for(const [field,value] of [['heartbeat_minutes',5],['stale_run_minutes',3],['max_dispatch_attempts',3],['base_backoff_seconds',300],['degraded_after_failures',2],['fail_closed_after_failures',3]]) {
   assert.ok(src.includes('Number(policy.'+field+')==='+value),field);
 }
 assert.match(src,/v215_policy_integrity_failed/);
 assert.match(src,/if\(String\(error\)\.includes\('v215_policy_integrity_failed'\)\)throw error/);
});
test('missing policy still uses the original authenticated REST provisioning path',()=>{
 assert.match(src,/const policy=await readExistingPolicy\(userId\)/);
 assert.match(src,/if\(policy\)return policy/);
 assert.match(src,/return await upsert\('command_ops_kernel_policies','user_id,policy_key'/);
 assert.match(src,/heartbeat_minutes:5,stale_run_minutes:3/);
 assert.match(src,/V215_POLICY_POOLER_FALLBACK/);
});
test('existing owner/seal authentication and capital firewalls remain mandatory',()=>{
 assert.match(src,/if\(!\(await authorized\(req\)\)\)/);
 assert.match(src,/const seal=await requireKernelSeal\(\)/);
 assert.match(src,/const owners=await loadOwners\(\)/);
 assert.match(src,/const policy=await ensurePolicy\(userId\)/);
 assert.match(src,/command_kernel_begin_run/);
 assert.match(src,/command_kernel_finish_run/);
 assert.match(src,/external_execution:false/);
 assert.match(src,/trades_sent:false/);
 assert.match(src,/capital_permission:'0R'/);
 assert.match(src,/action_permitted:'WAIT'/);
 assert.doesNotMatch(src,/ALTER SYSTEM|cron\.launch_active_jobs|pg_terminate_backend|drop table/i);
 assert.match(file('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
