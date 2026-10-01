import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const original = await readFile(new URL('../api/autonomous-qa-matrix.js', import.meta.url), 'utf8');
const source = original
  .replace(/^import .*;\s*$/m, '')
  .replace('export default async function handler', 'async function handler');

function buildHandler({body, upstreamStatus = 200, token = 'oidc-fixture'} = {}) {
  const fetchCalls = [];
  const fetch = async (url, options) => {
    fetchCalls.push({url:String(url), options});
    return {
      ok: upstreamStatus >= 200 && upstreamStatus < 300,
      status: upstreamStatus,
      json: async () => body
    };
  };
  const getVercelOidcToken = async () => token;
  const handler = new Function(
    'getVercelOidcToken','fetch','URL','AbortSignal',
    `${source}\nreturn handler;`
  )(getVercelOidcToken, fetch, URL, AbortSignal);
  return {handler, fetchCalls};
}

function responseRecorder() {
  const headers = new Map();
  let statusCode = 200;
  let payload;
  return {
    res: {
      setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); },
      status(code) { statusCode = code; return this; },
      json(body) { payload = body; return {statusCode, body, headers}; }
    },
    headers,
    status: () => statusCode,
    body: () => payload
  };
}

test('pressure-open QA evidence is CDN-shared while browser cache stays disabled', async () => {
  const body = {
    ok:false,
    state:'INCOMPLETE',
    transport:{pressure_circuit:{open:true,policy:'STOP_NEW_PROBES_ONLY'}}
  };
  const ctx = buildHandler({body});
  const rec = responseRecorder();
  await ctx.handler({method:'GET',url:'/api/autonomous-qa-matrix?ui_bucket=123'}, rec.res);

  assert.equal(ctx.fetchCalls.length, 1);
  assert.match(ctx.fetchCalls[0].url, /ui_bucket=123/);
  assert.equal(rec.headers.get('cache-control'), 'private, no-store');
  assert.equal(rec.headers.get('cdn-cache-control'), 'public, max-age=300');
  assert.equal(rec.headers.get('vercel-cdn-cache-control'), 'public, max-age=300');
  assert.equal(rec.headers.get('x-tfa-pressure-cache'), 'ACTIVE_5M');
  assert.equal(rec.status(), 200);
  assert.deepEqual(rec.body(), body);
});

test('healthy QA evidence is never shared by CDN', async () => {
  const body = {
    ok:true,
    state:'PASS',
    transport:{pressure_circuit:{open:false}}
  };
  const ctx = buildHandler({body});
  const rec = responseRecorder();
  await ctx.handler({method:'GET',url:'/api/autonomous-qa-matrix?ui_bucket=123'}, rec.res);

  assert.equal(rec.headers.get('cache-control'), 'private, no-store');
  assert.equal(rec.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(rec.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(rec.headers.get('x-tfa-pressure-cache'), 'BYPASS');
  assert.equal(rec.status(), 200);
});

test('missing workload identity remains fail-closed and uncached', async () => {
  const ctx = buildHandler({body:{}, token:''});
  const rec = responseRecorder();
  await ctx.handler({method:'GET',url:'/api/autonomous-qa-matrix?ui_bucket=123'}, rec.res);

  assert.equal(ctx.fetchCalls.length, 0);
  assert.equal(rec.status(), 503);
  assert.equal(rec.headers.get('cache-control'), 'no-store');
  assert.equal(rec.body().error, 'vercel_workload_identity_unavailable');
});
