import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/production-closure.js',import.meta.url),'utf8');
test('V183 closure observes sandbox certification without making it a live release gate',()=>{
 assert.match(source,/sandbox:'broker-sandbox-receipt-intake'/);
 assert.match(source,/sandbox_execution:/);
 const start=source.indexOf('const liveExecutionReady='),end=source.indexOf('const researchSample=',start);
 assert(start>0&&end>start);assert.doesNotMatch(source.slice(start,end),/sandbox/i);
 assert.match(source,/sandbox_evidence_can_unlock_capital:false/);
 assert.match(source,/capital_permission:'0R'/);
});
