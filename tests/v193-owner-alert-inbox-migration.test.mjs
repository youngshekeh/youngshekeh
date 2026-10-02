import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../supabase/migrations/20261002195647_v193_owner_gold_alert_inbox.sql',import.meta.url),'utf8');
test('V193 alert actions are immutable owner evidence and never execution permission',()=>{
  assert.match(sql,/gold_signal_alert_actions/);
  assert.match(sql,/append-only/);
  assert.match(sql,/previous_action_sha256/);
  assert.match(sql,/action_sha256/);
  assert.match(sql,/aal2_verified=true/);
  assert.match(sql,/action_permitted='WAIT'/);
  assert.match(sql,/capital_permission='0R'/);
  assert.match(sql,/automatic_execution=false/);
  assert.match(sql,/live_order_submission_enabled=false/);
  assert.match(sql,/acknowledgement_is_not_trade_approval/);
});
