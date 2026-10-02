import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../public/downloads/mt5-live-market-doctor.py',import.meta.url),'utf8');

test('V201 public doctor is read-only and contains no order or login path',()=>{
 assert.match(src,/read-only MT5 relay doctor/);
 assert.match(src,/never logs in/);
 assert.doesNotMatch(src,/method="POST"/);
 assert.doesNotMatch(src,/order_send/);
 assert.doesNotMatch(src,/login\s*\(/);
});

test('V201 public doctor checks local terminal, broker tick and server reachability',()=>{
 for(const token of ['windows_client','bridge_id_present','bridge_key_present','symbol_requested','mt5_python_package','mt5_initialize','terminal_connected','account_mode_supported','xauusd_symbol','broker_tick_available','intake_endpoint_reachable','v199_observability_reachable'])
   assert.match(src,new RegExp(token));
 assert.match(src,/5\.0\.6231/);
 assert.match(src,/READY FOR V200 SMOKE TEST/);
});

test('V201 public doctor remains WAIT 0R and fails closed',()=>{
 assert.match(src,/automatic_execution.*False/s);
 assert.match(src,/live_order_submission_enabled.*False/s);
 assert.match(src,/capital_permission.*"0R"/s);
 assert.match(src,/return 0 if ready else 2/);
});
