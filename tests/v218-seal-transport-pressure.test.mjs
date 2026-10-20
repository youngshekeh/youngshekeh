import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=file('supabase/functions/runtime-v180-continuous-kernel/index.ts');
const api=file('api/ops-heartbeat.js');
test('bounded two-lane seal: max 9s SQL + 8s REST fallback under degraded pooler',()=>{
  assert.match(edge,/const SEAL_DEADLINE_MS=8000/);
  assert.match(edge,/const REST_DEADLINE_MS=25000/);
  assert.match(edge,/setTimeout\(\(\)=>reject\(new Error\('seal_pooler_deadline'\)\),9000\)/);
  assert.match(edge,/rpc\('command_kernel_seal_status',\{\},SEAL_DEADLINE_MS\)/);
  assert.match(edge,/signal:AbortSignal\.timeout\(timeout\)/);
  assert.match(edge,/clearTimeout\(timer\)/);
  assert.match(edge,/await client\.end\(\{timeout:1\}\)/);
});
test('a negative database seal cannot fall through or become green',()=>{
  assert.match(edge,/if\(String\(error\)\.includes\('v180_kernel_security_seal_missing'\)\)throw error/);
  const positiveRequired=edge.match(/if\(!seal\?\.sealed\)throw new Error\('v180_kernel_security_seal_missing'\)/g)||[];
  assert.equal(positiveRequired.length,2);
  assert.match(edge,/const seal=await requireKernelSeal\(\)/);
  assert.match(api,/certifyKernelReceipt\(kernel\.body\)/);
});
test('pooler failure classes are finite code words; raw credentials not logged',()=>{
  assert.match(edge,/function safePoolerFailureClass\(error:unknown\)/);
  for(const c of ['POOLER_QUERY_DEADLINE','POOLER_AUTH_TIMEOUT_OR_REJECTED',
     'POOLER_NETWORK_UNAVAILABLE','POOLER_CONNECT_TIMEOUT','POOLER_UNAVAILABLE'])
    assert.match(edge,new RegExp("'"+c+"'"));
  assert.match(edge,/reason:safePoolerFailureClass\(error\)/);
  assert.doesNotMatch(edge,/console\.(?:warn|log|error)\([^)]*(?:DB_URL|SERVICE_ROLE|pooler\.password)/);
  assert.doesNotMatch(edge,/JSON\.stringify\(error\)/);
});
test('private OIDC/service-role security and capital governance unchanged',()=>{
  assert.match(edge,/if\(!\(await authorized\(req\)\)\)/);
  assert.match(edge,/if\(!SERVICE_ROLE\)/);
  assert.match(edge,/command_kernel_begin_run/);
  assert.match(edge,/command_kernel_finish_run/);
  assert.match(edge,/command_kernel_recover_dispatches/);
  assert.match(edge,/external_execution:false/);
  assert.match(edge,/action_permitted:'WAIT'/);
  assert.match(edge,/capital_permission:'0R'/);
  assert.match(edge,/trades_sent:false/);
  assert.match(api,/authHeader!==\x60Bearer \$\{cronSecret\}\x60/);
  assert.match(file('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
test('restore original unchanged owner and existing policy checks',()=>{
  assert.match(edge,/async function loadOwners\(\)/);
  assert.match(edge,/client\x60select user_id from public\.owner_users where active=true limit 20\x60/);
  assert.match(edge,/async function ensurePolicy\(userId:string\)/);
  assert.match(edge,/Number\(policy.max_dispatch_attempts\)===3/);
  assert.match(edge,/v215_policy_integrity_failed/);
  assert.doesNotMatch(edge,/ALTER SYSTEM|cron\.launch_active_jobs|pg_terminate_backend|drop table/i);
});
