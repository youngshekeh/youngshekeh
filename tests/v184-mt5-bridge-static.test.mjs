import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../scripts/mt5-demo-bridge.py',import.meta.url),'utf8');
test('MT5 bridge is demo-only and read-only',()=>{
 assert.match(source,/ACCOUNT_TRADE_MODE_DEMO/);
 assert.match(source,/account\.trade_mode/);
 assert.match(source,/NON_DEMO_ACCOUNT_BLOCKED/);
 assert.match(source,/symbol_info_tick/);
 assert.match(source,/history_deals_get/);
 assert.match(source,/history_orders_get/);
 assert.match(source,/X-TFA-Bridge-Key/);
 assert.doesNotMatch(source,/\border_send\s*\(/);
 assert.doesNotMatch(source,/\border_check\s*\(/);
 assert.doesNotMatch(source,/\bmt5\.login\s*\(/);
 assert.doesNotMatch(source,/password\s*=/i);
});
