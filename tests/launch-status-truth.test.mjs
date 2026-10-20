import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/status.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../status/index.html', import.meta.url), 'utf8');
const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function payload(state, options = {}) {
  return {
    ok: true, generated_at: new Date().toISOString(), state,
    auth: { password_ready: true },
    commercial: { ready: true, live_transaction_verified: true },
    hard_blockers: [], acceptance_pending: [], external_unknowns: [],
    ...options,
  };
}
async function renderStatus(readiness, qa, options = {}) {
  const ids = ['auth','ready','brain','identity','billing','kernel','launch-mode','last-observation','detail','evidence'];
  const nodes = Object.fromEntries(ids.map(id => [id, { textContent: 'CHECKING', className: 'value wait' }]));
  const fetch = async url => {
    const isQa = String(url).includes('autonomous-qa-matrix');
    const body = isQa ? qa : readiness;
    if (options.offline) throw new Error('network offline');
    return {
      ok: true,
      headers: { get(name) { return name === 'x-tfa-auth' ? 'VERCEL_OIDC' : null; } },
      json: async () => body,
    };
  };
  runInNewContext(source, {
    document: { getElementById(id) { return nodes[id] || null; } },
    fetch,
    AbortSignal,
    Date,
    Number,
    String,
    Promise,
  });
  await new Promise(resolve => setImmediate(resolve));
  return nodes;
}
const healthyQa = () => ({
  ok: true, generated_at: new Date().toISOString(),
  summary: { total: 3, passed: 3, failed: 0 },
});

test('status page exposes independent public launch gates', () => {
  for (const id of ['auth','ready','brain','identity','billing','kernel','launch-mode','detail']) {
    assert.match(page, new RegExp('id="' + id + '"'));
  }
  assert.match(home, /href="\.\/status\/"/);
  assert.match(source, /MAX_AGE_MS/);
});
test('HTTP 200 with BUILD_HOLD must not be displayed as launch acceptance', async () => {
  const result = await renderStatus(payload('BUILD_HOLD', { hard_blockers: ['database_incident'] }), healthyQa());
  assert.match(result['launch-mode'].textContent, /PUBLIC PREVIEW/);
  assert.equal(result.ready.className, 'value wait');
});
test('an all-green QA matrix cannot substitute for continuous-kernel evidence', async () => {
  const result = await renderStatus(payload('FULL_ACCEPTANCE_READY'), healthyQa());
  assert.match(result['launch-mode'].textContent, /PUBLIC PREVIEW/);
  assert.equal(result.kernel.className, 'value wait');
});
test('stale evidence must fail closed', async () => {
  const result = await renderStatus(payload('FULL_ACCEPTANCE_READY', {
    generated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  }), healthyQa());
  assert.match(result['launch-mode'].textContent, /PUBLIC PREVIEW/);
  assert.equal(result.ready.className, 'value wait');
});
test('network failures never create a successful status', async () => {
  const result = await renderStatus(payload('FULL_ACCEPTANCE_READY'), healthyQa(), { offline: true });
  assert.match(result['launch-mode'].textContent, /PUBLIC PREVIEW/);
  assert.equal(result.ready.className, 'value wait');
});
test('full launch is possible only with all five positive gates and a recent WAIT/0R kernel receipt', async () => {
  const qa = healthyQa();
  qa.continuous_kernel = {
    ok: true, last_succeeded_at: new Date().toISOString(), capital_permission: '0R'
  };
  const result = await renderStatus(payload('FULL_ACCEPTANCE_READY'), qa);
  assert.equal(result['launch-mode'].textContent, 'FULL LAUNCH ACCEPTED');
  assert.equal(result.kernel.className, 'value good');
});
test('public UI contains no privileged runtime secret or execution APIs', () => {
  assert.doesNotMatch(source, /SERVICE_ROLE_KEY|CRON_SECRET|order_send|session_token/);
  assert.match(source, /WAIT \/ 0R/);
});
