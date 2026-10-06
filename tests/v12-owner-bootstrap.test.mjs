import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../src/owner.ts',import.meta.url),'utf8');

test('owner live-market panel consumes V12 relay bootstrap state',()=>{
  assert.match(source,/liveRelayBootstrap/);
  assert.match(source,/fetch\('\/api\/q4-machine-v12'/);
  assert.match(source,/Bridge enrolled but never authenticated/);
  assert.match(source,/run V205 on the Windows MT5 host/);
});

test('owner bootstrap guidance preserves one-time credential rotation boundary',()=>{
  assert.match(source,/If the key was lost, revoke and recreate the read-only bridge here/);
  assert.match(source,/old keys are intentionally unrecoverable/);
  assert.match(source,/liveRelayBootstrap = null/);
});

test('owner bootstrap guidance preserves WAIT 0R language',()=>{
  assert.match(source,/orders OFF · capital 0R/);
  assert.doesNotMatch(source,/V12.*order submission enabled/i);
});
