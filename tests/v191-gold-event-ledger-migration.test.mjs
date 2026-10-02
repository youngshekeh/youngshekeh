import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261002191822_v191_gold_signal_lifecycle_event_ledger.sql',import.meta.url),'utf8');
test('V191 ledger is append-only, hash-chained and permanently WAIT/0R',()=>{
 assert.match(sql,/gold_signal_lifecycle_events/);
 assert.match(sql,/append-only/);
 assert.match(sql,/previous_event_sha256/);
 assert.match(sql,/event_sha256/);
 assert.match(sql,/action_permitted='WAIT'/);
 assert.match(sql,/capital_permission='0R'/);
 assert.match(sql,/automatic_execution=false/);
 assert.match(sql,/live_order_submission_enabled=false/);
 assert.match(sql,/HASH_CHAIN_VERIFIED/);
});
