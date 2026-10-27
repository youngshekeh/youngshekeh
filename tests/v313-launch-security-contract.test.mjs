import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const heartbeat = readFileSync(new URL('../api/ops-heartbeat.js', import.meta.url), 'utf8');
const globalHeaders = vercel.headers?.find(rule => rule.source === '/(.*)')?.headers ?? [];
const getHeader = name => globalHeaders.find(h => h.key.toLowerCase() === name.toLowerCase())?.value ?? '';

test('production release requires an explicit reviewed [deploy] commit', () => {
  const guard = vercel.ignoreCommand ?? '';
  assert.match(guard, /the-father-analytics-deploy/);
  assert.match(guard, /\[deploy\]/);
  assert.match(guard, /exit 0/);
  assert.match(guard, /exit 1/);
});

test('security response headers stay fail-closed', () => {
  const csp = getHeader('Content-Security-Policy');
  const script = csp.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1] ?? '';
  for (const rule of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "script-src-attr 'none'"]) {
    assert.ok(csp.includes(rule), 'Required CSP directive missing: ' + rule);
  }
  assert.ok(script.includes("'self'"));
  assert.ok(!script.includes("'unsafe-eval'"));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.ok(!/\*|https?:\/\//.test(script), 'No wildcard or broad remote script hosts');
  assert.match(getHeader('Strict-Transport-Security'), /max-age=\d+/);
  assert.equal(getHeader('X-Content-Type-Options'), 'nosniff');
  assert.equal(getHeader('X-Frame-Options'), 'DENY');
});

test('private application and API routes remain uncached and non-indexed', () => {
  const api = vercel.headers?.find(h => h.source === '/api/(.*)')?.headers ?? [];
  const privateRoutes = vercel.headers?.find(h => h.source.includes('member|owner|checkout|access'))?.headers ?? [];
  assert.ok(api.some(h => h.key === 'X-Robots-Tag' && h.value.includes('noindex')));
  assert.ok(privateRoutes.some(h => h.key === 'Cache-Control' && h.value.includes('no-store')));
  assert.ok(privateRoutes.some(h => h.key === 'X-Robots-Tag' && h.value.includes('noindex')));
});

test('cron heartbeat continues to require secret, OIDC, and certified receipts', () => {
  const cron = vercel.crons?.find(c => c.path === '/api/ops-heartbeat');
  assert.equal(cron?.schedule, '4-59/5 * * * *');
  assert.match(heartbeat, /req\.method\s*!==\s*'GET'/);
  assert.match(heartbeat, /process\.env\.CRON_SECRET/);
  assert.match(heartbeat, /authHeader\s*!==\s*`Bearer \$\{cronSecret\}`/);
  assert.match(heartbeat, /getVercelOidcToken\(\)/);
  assert.match(heartbeat, /certifyKernelReceipt\(kernel\.body\)/);
  assert.match(heartbeat, /kernel_receipts_uncertified/);
  assert.match(heartbeat, /'Cache-Control','no-store'/);
});

test('the machine keeps WAIT / 0R and does not auto-recover its database', () => {
  assert.match(heartbeat, /action_permitted:\s*'WAIT'/);
  assert.match(heartbeat, /capital_permission:\s*'0R'/);
  assert.match(heartbeat, /funds_moved:\s*false/);
  assert.match(heartbeat, /trades_sent:\s*false/);
  assert.match(heartbeat, /human_release_required:\s*true/);
  assert.match(heartbeat, /preserve_unrelated_cron_jobs/);
});
