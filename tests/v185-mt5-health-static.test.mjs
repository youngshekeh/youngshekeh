import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../scripts/mt5-demo-bridge.py',import.meta.url),'utf8');
test('V185 relay proves client health before evidence and remains read-only',()=>{
 assert.match(source,/RELAY_VERSION = "v185\.0"/);
 assert.match(source,/EXPECTED_MT5_VERSION = "5\.0\.6231"/);
 assert.match(source,/WINDOWS_CLIENT_REQUIRED/);
 assert.match(source,/NON_DEMO_ACCOUNT_BLOCKED/);
 assert.match(source,/broker-sandbox-bridge-health/);
 assert.match(source,/post_heartbeat\(state, symbol, started\)/);
 const heartbeat=source.indexOf('post_heartbeat(state, symbol, started)');
 const quote=source.indexOf('forward_quote(state, symbol, last_tick)');
 assert(heartbeat>0&&quote>heartbeat);
 assert.doesNotMatch(source,/\border_send\s*\(/);
 assert.doesNotMatch(source,/\border_check\s*\(/);
 assert.doesNotMatch(source,/\bmt5\.login\s*\(/);
 assert.doesNotMatch(source,/password\s*=/i);
});
