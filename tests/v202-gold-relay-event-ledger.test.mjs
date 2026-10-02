import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const edge=await readFile(new URL('../supabase/functions/public-gold-relay-event-ledger-v202/index.ts',import.meta.url),'utf8');
const api=await readFile(new URL('../api/gold-relay-event-ledger-v202.js',import.meta.url),'utf8');

test('V202 consumes only the canonical V199 relay state and strips secrets',()=>{
  assert.match(edge,/gold-relay-observability-v199/);
  assert.match(edge,/capture_v202_gold_relay_event/);
  assert.match(edge,/get_v202_gold_relay_event_ledger/);
  assert.match(edge,/bridge_ids_public:false/);
  assert.match(edge,/bridge_keys_public:false/);
  assert.doesNotMatch(edge,/bridge_id:/);
  assert.doesNotMatch(edge,/bridge_key:/);
});

test('V202 hard-locks execution governance',()=>{
  assert.match(edge,/action_permitted:'WAIT'/);
  assert.match(edge,/capital_permission:'0R'/);
  assert.match(edge,/automatic_execution:false/);
  assert.match(edge,/live_order_submission_enabled:false/);
});

test('V202 Vercel route is fixed-source GET only',()=>{
  assert.match(api,/public-gold-relay-event-ledger-v202/);
  assert.match(api,/req\.method!=='GET'/);
  assert.doesNotMatch(api,/req\.query|req\.body/);
});
