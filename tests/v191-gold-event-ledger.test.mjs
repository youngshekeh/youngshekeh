import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const capture=await readFile(new URL('../supabase/functions/runtime-v191-gold-signal-event-capture/index.ts',import.meta.url),'utf8');
const reader=await readFile(new URL('../supabase/functions/public-gold-signal-event-ledger-v191/index.ts',import.meta.url),'utf8');
const api=await readFile(new URL('../api/gold-event-ledger-v191.js',import.meta.url),'utf8');

test('V191 capture is cron-authenticated and consumes only V189 canonical trigger watch',()=>{
  assert.match(capture,/x-tfa-cron-secret/);
  assert.match(capture,/runtime_tokens/);
  assert.match(capture,/gold-trigger-watch-v189/);
  assert.match(capture,/capture_v191_gold_signal_event/);
  assert.match(capture,/capital_permission:'0R'/);
  assert.match(capture,/automatic_execution:false/);
});
test('V191 public reader exposes only the governed ledger RPC',()=>{
  assert.match(reader,/get_v191_gold_signal_event_ledger/);
  assert.match(reader,/capital_permission:'0R'/);
  assert.doesNotMatch(reader,/req\.json|req\.body/);
});
test('V191 Vercel route is fixed-source read only',()=>{
  assert.match(api,/public-gold-signal-event-ledger-v191/);
  assert.match(api,/capital_permission:'0R'/);
  assert.doesNotMatch(api,/req\.query|req\.body/);
});
