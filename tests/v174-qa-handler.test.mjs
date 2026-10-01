import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createQaTransport} from '../supabase/functions/runtime-v115-autonomous-qa/transport.mjs';

const original = await readFile(new URL('../supabase/functions/runtime-v115-autonomous-qa/index.ts', import.meta.url), 'utf8');
const source = stripTypeScriptTypes(original.replace(/^import .*;\s*$/m, ''));
function fixture({deadline = false, authorized = true} = {}) {
  let handler, clock = 0, calls = 0;
  const performance = {now: () => clock};
  const Deno = {env: {get: name => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-service-role' : ''},
    serve: fn => {handler = fn;}};
  const fetch = async () => {
    calls++;
    if (deadline && calls === 1) clock = 25000;
    return new Response('{}', {headers: {'Content-Type': 'application/json'}});
  };
  const transportFactory = options => createQaTransport({...options, now: performance.now, fetchImpl: fetch});
  new Function('Deno', 'performance', 'fetch', 'createQaTransport', source)(Deno, performance, fetch, transportFactory);
  const request = new Request('https://fixture.invalid/qa',
    {headers: authorized ? {Authorization: 'Bearer fixture-service-role'} : {}});
  return {run: () => handler(request), calls: () => calls};
}
test('anonymous QA remains denied before any downstream work', async () => {
  const ctx = fixture({authorized: false}); const response = await ctx.run();
  assert.equal(response.status, 401); assert.equal(ctx.calls(), 0);
  assert.equal((await response.json()).error, 'unauthorized_private_runtime');
});
test('deadline returns all 78 invariant rows with explicit incomplete transport', async () => {
  const ctx = fixture({deadline: true}); const response = await ctx.run(); const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.state, 'INCOMPLETE'); assert.equal(body.ok, false);
  assert.equal(body.tests.length, 78); assert.equal(body.summary.passed + body.summary.failed, 78);
  assert.equal(ctx.calls(), 1); assert.equal(body.transport.not_started_probes, 39);
  assert.equal(body.transport.deadline_aborted_probes, 1);
  assert.equal(body.invariants.action_permitted, 'WAIT'); assert.equal(body.invariants.capital_permission, '0R');
  assert.equal(body.invariants.automatic_promotion, false);
  assert.equal(body.tests.find(x => x.name === 'v172_paper_quote_anonymous_denial').pass, false);
});
test('completed requests with invalid engine payloads fail instead of passing QA', async () => {
  const ctx = fixture(); const body = await (await ctx.run()).json();
  assert.equal(body.state, 'FAIL'); assert.equal(body.ok, false);
  assert.equal(body.transport.incomplete, false); assert.equal(body.transport.planned_probes, 40);
  assert.equal(body.transport.http_attempts, 40); assert.equal(ctx.calls(), 40);
  assert.equal(body.tests.find(x => x.name === 'v112_capital_firewall').pass, false);
});

const frontend = await readFile(new URL('../src/main.ts', import.meta.url), 'utf8');
const loaderSource = stripTypeScriptTypes(frontend.slice(frontend.indexOf('async function loadQaMatrix()'),
  frontend.indexOf('\nasync function ', frontend.indexOf('async function loadQaMatrix()') + 1)));
async function runLoader(response, times = 1) {
  let calls = 0; const displayed = new Map(); const detail = {textContent: ''};
  const document = {querySelector: query => query.endsWith(' p') ? detail : {dataset: {}}};
  const fetch = async () => {calls++; if (response instanceof Error) throw response; return response;};
  const load = new Function('fetch', 'missionText', 'updateMissionTapeItem', 'document',
    `${loaderSource}\nreturn loadQaMatrix;`)(fetch, (id, text) => displayed.set(id, text), () => {}, document);
  for (let i = 0; i < times; i++) await load();
  return {calls, displayed, detail};
}
test('dashboard retains an incomplete matrix and never launches an automatic retry', async () => {
  const ctx = await runLoader({ok: true, json: async () => ({state: 'INCOMPLETE', summary: {passed: 12, total: 78},
    transport: {incomplete: true, not_started_probes: 29}})});
  assert.equal(ctx.calls, 1); assert.equal(ctx.displayed.get('briefQA'), '12/78 INCOMPLETE');
  assert.match(ctx.detail.textContent, /29 probes not reached/);
});
test('dashboard enters five-minute QA backoff after V179 pressure circuit opens', async () => {
  const ctx = await runLoader({ok: true, json: async () => ({
    state: 'INCOMPLETE',
    summary: {passed: 39, total: 78},
    transport: {
      incomplete: true,
      not_started_probes: 26,
      pressure_circuit: {open: true, policy: 'STOP_NEW_PROBES_ONLY'}
    }
  })}, 2);
  assert.equal(ctx.calls, 1);
  assert.match(ctx.displayed.get('briefQA'), /PRESSURE COOLDOWN/);
  assert.match(ctx.detail.textContent, /automatic QA checks paused/);
});

test('dashboard reports failed HTTP or network access without launching another QA run', async () => {
  for (const response of [{ok: false}, new Error('fixture network failure')]) {
    const ctx = await runLoader(response);
    assert.equal(ctx.calls, 1); assert.equal(ctx.displayed.get('briefQA'), 'QA CHANNEL UNAVAILABLE');
  }
});

const refreshSource = stripTypeScriptTypes(frontend.slice(frontend.indexOf('let missionRefreshInFlight'),
  frontend.indexOf('void refreshMissionExperience();')));
test('overlapping dashboard refreshes launch one mission and one QA request', async () => {
  let finish, missions = 0, checks = 0;
  const loadMissionBrief = async () => {missions++; await new Promise(resolve => {finish = resolve;});};
  const refresh = new Function('loadMissionBrief', 'loadQaMatrix',
    `${refreshSource}\nreturn refreshMissionExperience;`)(loadMissionBrief, async () => {checks++;});
  const first = refresh(); await refresh(); assert.equal(missions, 1); finish(); await first;
  assert.equal(checks, 1);
});
test('a failed dashboard refresh releases its guard for a later request', async () => {
  let missions = 0, checks = 0;
  const refresh = new Function('loadMissionBrief', 'loadQaMatrix',
    `${refreshSource}\nreturn refreshMissionExperience;`)(async () => {
      if (++missions === 1) throw new Error('fixture failure');
    }, async () => {checks++;});
  await assert.rejects(refresh()); await refresh(); assert.equal(missions, 2); assert.equal(checks, 1);
});
