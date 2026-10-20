import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../api/ops-heartbeat.js', import.meta.url), 'utf8');

test('only Vercel-authenticated cron may trigger the kernel', () => {
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /authHeader!==`Bearer \$\{cronSecret\}`/);
  assert.match(source, /getVercelOidcToken\(\)/);
  assert.match(source, /if\(!oidc\)return failClosed/);
});

test('the private kernel must succeed before the heartbeat reports success', () => {
  assert.match(source, /if\(kernel\.ok&&proof\?\.verified\)\{/);
  assert.match(source, /state:'CONTINUOUS_KERNEL_ACTIVE'/);
  assert.match(source, /KERNEL_UNAVAILABLE_NON_DISRUPTIVE/);
  assert.match(source, /private_kernel_unhealthy/);
  assert.match(source, /res,503,'KERNEL_UNAVAILABLE_NON_DISRUPTIVE'/);
});

test('an outage cannot globally disable the database scheduler', () => {
  assert.doesNotMatch(source, /CRON_GATE|cron_launch_gate|cron\.launch_active_jobs|mode=off/i);
  assert.doesNotMatch(source, /ALTER SYSTEM/i);
  assert.match(source, /database_scheduler:\{changed:false/);
  assert.match(source, /explicit_approved_runbook_required/);
});

test('denied heartbeat and backend outage remain zero-capital and fail-closed', () => {
  assert.match(source, /action_permitted:'WAIT'/);
  assert.match(source, /capital_permission:'0R'/);
  assert.match(source, /external_execution:false/);
  assert.match(source, /human_release_required:true/);
  assert.match(source, /Cache-Control','no-store'/);
});
