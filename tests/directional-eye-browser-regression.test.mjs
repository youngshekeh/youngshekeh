import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/directional-eye.mjs',import.meta.url),'utf8');
test('failed Eye request checks the current epoch, never an undefined variable',()=>{
 assert.ok(source.includes('catch{if(!epochs.isCurrent(epoch))return;'));
 assert.ok(!source.includes('requestEpoch'));
});
test('timeout belongs to its own request after navigation',()=>{
 assert.ok(source.includes('setTimeout(()=>requestController.abort(),8000)'));
 assert.ok(source.includes('signal:requestController.signal'));
 assert.ok(!source.includes('setTimeout(()=>controller?.abort(),8000)'));
});
