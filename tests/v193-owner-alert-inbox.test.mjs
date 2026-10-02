import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const fn=await readFile(new URL('../supabase/functions/owner-gold-alert-actions/index.ts',import.meta.url),'utf8');
const owner=await readFile(new URL('../owner/index.html',import.meta.url),'utf8');
const client=await readFile(new URL('../src/owner.ts',import.meta.url),'utf8');

test('V193 owner alert function requires owner session and AAL2',()=>{
  assert.match(fn,/owner_users/);
  assert.match(fn,/aal2_required/);
  assert.match(fn,/record_v193_gold_alert_action/);
  assert.match(fn,/get_v193_gold_alert_inbox/);
  assert.match(fn,/acknowledgement_is_not_trade_approval:true/);
  assert.match(fn,/capital_permission:"0R"/);
});
test('V193 owner surface exposes alert inbox actions only after owner flow',()=>{
  assert.match(owner,/V193 · OWNER GOLD ALERT INBOX/);
  assert.match(owner,/alertInboxRefresh/);
  assert.match(client,/owner-gold-alert-actions/);
  assert.match(client,/ACKNOWLEDGED/);
  assert.match(client,/SNOOZED/);
  assert.match(client,/CLOSED/);
});
