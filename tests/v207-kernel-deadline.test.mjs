import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const edge=readFileSync(new URL('../supabase/functions/runtime-v180-continuous-kernel/index.ts',import.meta.url),'utf8');
const shell=readFileSync(new URL('../api/ops-heartbeat.js',import.meta.url),'utf8');

test('private edge seal has a bounded 22s evidence deadline',()=>{
  assert.match(edge,/const REST_DEADLINE_MS=25000/);
  assert.match(edge,/const SEAL_DEADLINE_MS=22000/);
  assert.match(edge,/rpc\('command_kernel_seal_status',\{\},SEAL_DEADLINE_MS\)/);
  assert.match(edge,/if\(!seal\?\.sealed\)throw new Error/);
});
test('public OIDC and private seal cannot be bypassed',()=>{
  assert.match(shell,/getVercelOidcToken\(\)/);
  assert.match(shell,/authHeader!==\x60Bearer/);
  assert.match(edge,/authorized\(req\)/);
  assert.match(edge,/if\(!SERVICE_ROLE\)/);
  assert.match(edge,/const seal=await requireKernelSeal\(\)/);
});
test('deadline stays below 90s and five minute cron cadence',()=>{
  assert.match(shell,/maxDuration:90/);
  assert.match(shell,/KERNEL,oidc,70000/);
  assert.match(edge,/signal:AbortSignal\.timeout\(REST_DEADLINE_MS\)/);
  assert.match(edge,/async function rpc\(name:string,body:any,timeout=REST_DEADLINE_MS\)/);
});
test('all capital, recovery and scheduler firewalls remain intact',()=>{
  assert.match(shell,/capital_permission:'0R'/);
  assert.match(shell,/action_permitted:'WAIT'/);
  assert.match(shell,/database_scheduler:\{changed:false/);
  assert.doesNotMatch(shell,/cron\.launch_active_jobs|ALTER SYSTEM|mode=off/i);
  assert.match(edge,/external_execution:false/);
  assert.match(edge,/trades_sent:false/);
  assert.match(edge,/command_kernel_begin_run/);
  assert.match(edge,/command_kernel_finish_run/);
  assert.match(edge,/command_kernel_recover_dispatches/);
});
