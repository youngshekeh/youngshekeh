import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../supabase/functions/runtime-v180-continuous-kernel/index.ts',import.meta.url),'utf8');
test('owner lookup is an authenticated bounded read-only pooler query',()=>{
 assert.match(source,/async function loadOwners\(\)/);
 assert.match(source,/client\x60select user_id from public\.owner_users where active=true limit 20\x60/);
 assert.match(source,/const owners=await loadOwners\(\)/);
 assert.match(source,/if\(!\(await authorized\(req\)\)\)/);
 assert.match(source,/max:1,prepare:false,fetch_types:false,connect_timeout:4/);
});
test('uncertain pooler transport falls back to original bounded REST lookup',()=>{
 assert.match(source,/V209_OWNER_POOLER_FALLBACK/);
 assert.match(source,/owner_pooler_deadline/);
 assert.match(source,/return await dbRows\('owner_users\?active=eq\.true&select=user_id&limit=20'\)/);
 assert.match(source,/await client\.end\(\{timeout:1\}\)/);
});
test('negative evidence and seal remain fail closed',()=>{
 assert.match(source,/if\(!owners\.length\)throw new Error\('no_active_owner'\)/);
 assert.match(source,/const seal=await requireKernelSeal\(\)/);
 assert.match(source,/if\(!seal\?\.sealed\)throw new Error\('v180_kernel_security_seal_missing'\)/);
});
test('DB write path, downstream governance and capital remain untouched',()=>{
 assert.match(source,/const policy=await ensurePolicy\(userId\)/);
 assert.match(source,/command_kernel_begin_run/);
 assert.match(source,/command_kernel_finish_run/);
 assert.match(source,/command_kernel_recover_dispatches/);
 assert.match(source,/external_execution:false/);
 assert.match(source,/trades_sent:false/);
 assert.match(source,/capital_permission:'0R'/);
 assert.match(source,/action_permitted:'WAIT'/);
 assert.doesNotMatch(source,/ALTER SYSTEM|cron\.launch_active_jobs|pg_terminate_backend|drop table/i);
});
