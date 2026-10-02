import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/gold-signal-map.js',import.meta.url),'utf8');
test('V187 route is fixed-source and fail-closed',()=>{
 assert.match(source,/runtime-v75-day-state/);
 assert.match(source,/runtime-v81-mtf-zones/);
 assert.match(source,/runtime-v82-mtf-confluence/);
 assert.match(source,/runtime-v83-breakout/);
 assert.match(source,/broker-live-market-intake/);
 assert.match(source,/capital_permission:'0R'/);
 assert.match(source,/automatic_execution:false/);
 assert.doesNotMatch(source,/req\.query|req\.body|new URL\(req\.url/);
});
