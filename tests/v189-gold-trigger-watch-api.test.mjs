import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/gold-trigger-watch-v189.js',import.meta.url),'utf8');
test('V189 reads only canonical lifecycle and cannot submit orders',()=>{
 assert.match(source,/\/api\/gold-signal-lifecycle/);
 assert.match(source,/buildGoldTriggerWatch/);
 assert.match(source,/capital_permission:'0R'/);
 assert.doesNotMatch(source,/req\.query|req\.body|order_send|order_check|broker-live-market-intake/);
});
