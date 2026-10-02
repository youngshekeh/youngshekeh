import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/production-closure.js',import.meta.url),'utf8');
test('V184 bridge telemetry cannot become live execution permission',()=>{
 assert.match(source,/sandboxBridge:'broker-sandbox-bridge-intake'/);
 assert.match(source,/sandbox_bridge:/);
 const start=source.indexOf('const liveExecutionReady='),end=source.indexOf('const researchSample=',start);
 assert(start>0&&end>start);assert.doesNotMatch(source.slice(start,end),/sandboxBridge|sandbox_bridge/i);
 assert.match(source,/bridge_can_unlock_capital:false/);
 assert.match(source,/capital_permission:'0R'/);
});
