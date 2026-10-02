import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('../downloads/mt5-live-market-doctor.py',import.meta.url),'utf8');

test('V201 doctor is local preflight and never posts a tick',()=>{
 assert.match(src,/read-only MT5 relay doctor/);
 assert.match(src,/No market data was transmitted/);
 assert.doesNotMatch(src,/method="POST"/);
 assert.doesNotMatch(src,/order_send/);
 assert.doesNotMatch(src,/login\s*\(/);
});

test('V201 doctor verifies required Windows MT5 prerequisites',()=>{
 for(const token of ['WINDOWS','MT5_PYTHON_PACKAGE','BRIDGE_ID','BRIDGE_KEY','XAUUSD_SYMBOL','SERVER_OBSERVABILITY','MT5_INITIALIZE','MT5_TERMINAL_CONNECTED','MT5_ACCOUNT_VISIBLE','MT5_SYMBOL_SELECTED','MT5_XAUUSD_TICK'])
   assert.match(src,new RegExp(token));
 assert.match(src,/5\.0\.6231/);
 assert.match(src,/READY_FOR_ONE_SHOT_TICK/);
});

test('V201 doctor fails closed when any prerequisite fails',()=>{
 assert.match(src,/passed=all\(checks\)/);
 assert.match(src,/return 0 if passed else 1/);
});
