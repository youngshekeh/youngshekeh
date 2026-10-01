import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createQaTransport} from '../supabase/functions/runtime-v115-autonomous-qa/transport.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body),
  {status, headers: {'Content-Type': 'application/json'}});
function context(t, options = {}) {
  const transport = createQaTransport(options);
  t.after(() => transport.close());
  return transport;
}

test('healthy fetches retain actual status, body, and workload headers', async t => {
  const transport = context(t, {fetchImpl: async () => new Response('{"ok":true}',
    {headers: {'Content-Type': 'application/json', 'X-TFA-Auth': 'VERCEL_OIDC'}})});
  const probe = await transport.any('https://fixture.invalid/api/state?secret=withheld');
  assert.equal(probe.ok, true); assert.equal(probe.started, true);
  assert.equal(probe.headers.tfa_auth, 'VERCEL_OIDC');
  assert.equal(transport.summary([probe]).incomplete, false);
  assert.equal(transport.summary([probe]).attempts[0].path, '/api/state');
});
test('unauthorized and client errors are measured once without retry', async t => {
  let calls = 0;
  const transport = context(t, {fetchImpl: async () => {calls++; return json({error: 'missing_token'}, 401);}});
  const probe = await transport.retry(() => transport.post('https://fixture.invalid/intake', {}), 0);
  assert.equal(calls, 1); assert.equal(probe.status, 401); assert.equal(probe.body.error, 'missing_token');
});
test('explicit server failures are evidence and are never retried', async t => {
  let calls = 0;
  const transport = context(t, {fetchImpl: async () => {calls++; return json({ok: false}, 503);}});
  const probe = await transport.retry(() => transport.json('https://fixture.invalid/status'), 0);
  assert.equal(calls, 1); assert.equal(probe.status, 503); assert.equal(probe.ok, false);
  const status = transport.summary([probe]);
  assert.equal(status.http_5xx_retry, false);
  assert.equal(status.retry_policy, 'QUICK_TRANSPORT_FAILURE_ONLY');
});
test('a quick transport failure gets at most one retry when time remains', async t => {
  let calls = 0;
  const transport = context(t, {fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new TypeError('fetch failed');
    return json({ok: true}, 200);
  }});
  const probe = await transport.retry(() => transport.json('https://fixture.invalid/status'), 0);
  assert.equal(calls, 2); assert.equal(probe.status, 200);
  assert.equal(transport.summary([probe]).http_attempts, 2);
});
test('a small remaining budget prevents another quick transport retry', async t => {
  let calls = 0;
  const transport = context(t, {budgetMs: 500, fetchImpl: async () => {calls++; throw new TypeError('fetch failed');}});
  const probe = await transport.retry(() => transport.json('https://fixture.invalid/status'), 0);
  assert.equal(calls, 1); assert.equal(probe.retry_withheld, true);
});
test('worker concurrency stays at three even if a caller requests eight', async t => {
  let active = 0, peak = 0;
  const transport = context(t, {fetchImpl: async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 3)); active--; return json({ok: true});
  }});
  const probes = await transport.all(Array.from({length: 12}, () => () => transport.json('https://fixture.invalid/state')), 8);
  assert.equal(peak, 3); assert.equal(probes.length, 12); assert.ok(probes.every(x => x.ok));
});
test('deadline cancels active HTTP requests and never starts queued probes', async t => {
  let calls = 0, aborted = 0;
  const transport = context(t, {budgetMs: 60, fetchImpl: async (_url, {signal}) => {
    calls++;
    return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      aborted++; reject(signal.reason);
    }, {once: true}));
  }});
  const probes = await transport.all(Array.from({length: 10}, () => () => transport.json('https://fixture.invalid/state', 5000)), 3);
  const status = transport.summary(probes);
  assert.equal(calls, 3); assert.equal(aborted, 3); assert.equal(status.not_started_probes, 7);
  assert.equal(status.incomplete, true); assert.ok(probes.every(x => !x.ok && x.body === null));
  assert.ok(status.elapsed_ms < 350, JSON.stringify(status));
});
test('authentication time consumes the same request budget', async t => {
  let clock = 90, calls = 0;
  const transport = context(t, {budgetMs: 100, startedAt: 0, now: () => clock,
    fetchImpl: async () => {calls++; return json({ok: true});}});
  clock = 101;
  const probe = await transport.json('https://fixture.invalid/state');
  assert.equal(calls, 0); assert.equal(probe.started, false);
  assert.equal(transport.summary([probe]).deadline_exceeded, true);
});
test('caller cancellation prevents new work', async t => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const transport = context(t, {requestSignal: controller.signal,
    fetchImpl: async () => {calls++; return json({});}});
  const probes = await transport.all([() => transport.json('https://fixture.invalid/state')]);
  assert.equal(calls, 0); assert.equal(transport.summary(probes).request_aborted, true);
});
test('caller cancellation interrupts a quick transport retry delay', async t => {
  const controller = new AbortController(); let calls = 0;
  const transport = context(t, {requestSignal: controller.signal,
    fetchImpl: async () => {calls++; throw new TypeError('fetch failed');}});
  const pending = transport.retry(() => transport.json('https://fixture.invalid/state'), 100);
  setTimeout(() => controller.abort(), 5);
  const probe = await pending;
  assert.equal(calls, 1); assert.equal(probe.retry_withheld, true);
});
test('malformed JSON cannot become a successful observation', async t => {
  const transport = context(t, {fetchImpl: async () => new Response('bad-json',
    {headers: {'Content-Type': 'application/json'}})});
  const probe = await transport.json('https://fixture.invalid/state');
  assert.equal(probe.ok, false); assert.equal(probe.body, null);
  assert.equal(transport.summary([probe]).attempts[0].status, 200);
});
test('deadline applies to a real HTTP body stalled after headers arrive', async t => {
  const server = createServer((_req, res) => {
    res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{"ok":');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {server.closeAllConnections(); server.close();});
  const transport = context(t, {budgetMs: 80});
  const probe = await transport.json(`http://127.0.0.1:${server.address().port}/slow-body`, 5000);
  assert.equal(probe.ok, false); assert.equal(probe.body, null);
  assert.equal(transport.summary([probe]).attempts[0].status, 200);
  assert.ok(probe.latency_ms < 350);
});
