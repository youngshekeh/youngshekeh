import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../scripts/mt5-live-market-bridge.py',import.meta.url),'utf8');
test('V186 MT5 relay is read-only and supports live quote account modes',()=>{
 assert.match(source,/RELAY_VERSION="v186\.0"/);
 assert.match(source,/ACCOUNT_TRADE_MODE_DEMO/);assert.match(source,/ACCOUNT_TRADE_MODE_REAL/);
 assert.match(source,/symbol_info_tick/);assert.match(source,/X-TFA-Live-Bridge-Key/);
 assert.doesNotMatch(source,/\border_send\s*\(/);assert.doesNotMatch(source,/\border_check\s*\(/);
 assert.doesNotMatch(source,/\bmt5\.login\s*\(/);assert.doesNotMatch(source,/password\s*=/i);
});
test('published V186 relay matches audited source',async()=>{
 const published=await readFile(new URL('../public/downloads/mt5-live-market-bridge.py',import.meta.url),'utf8');
 assert.equal(published,source);
});
