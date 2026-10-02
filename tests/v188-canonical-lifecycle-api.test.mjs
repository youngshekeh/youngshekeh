import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/gold-signal-lifecycle.js',import.meta.url),'utf8');
test('V188.1 canonical lifecycle reads fixed governed inputs and remains non-executing',()=>{
 for(const x of ['runtime-v75-day-state','runtime-v81-mtf-zones','runtime-v82-mtf-confluence','runtime-v83-breakout','runtime-v79-liquidity','runtime-v188-session-liquidity','broker-live-market-intake'])
  assert.match(source,new RegExp(x));
 assert.match(source,/buildGoldSignalMap/);
 assert.match(source,/buildGoldSignalLifecycle/);
 assert.match(source,/capital_permission:'0R'/);
 assert.match(source,/automatic_execution:false/);
 assert.doesNotMatch(source,/req\.query|req\.body|order_send|order_check/);
});
