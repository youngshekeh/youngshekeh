import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../api/production-closure.js',import.meta.url),'utf8');
test('V185 health telemetry is visible but cannot become live execution permission',()=>{
 assert.match(source,/sandboxBridgeHealth:'broker-sandbox-bridge-health'/);
 assert.match(source,/sandbox_bridge_health:/);
 const start=source.indexOf('const liveExecutionReady='),end=source.indexOf('const researchSample=',start);
 assert(start>0&&end>start);
 assert.doesNotMatch(source.slice(start,end),/sandboxBridgeHealth|sandbox_bridge_health/i);
 assert.match(source,/health_can_unlock_capital:false/);
 assert.match(source,/capital_permission:'0R'/);
});
