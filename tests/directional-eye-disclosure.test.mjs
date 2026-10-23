import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/directional-eye.mjs',import.meta.url),'utf8');
test('expanded evidence state survives frequent dashboard repaint',()=>{
 assert.ok(source.includes('const disclosure=new Map()'));
 assert.ok(source.includes('disclosure.get(asset)'));
 assert.ok(source.includes('disclosure.set(asset,details.open)'));
 assert.ok(source.includes("card.dataset.asset=asset"));
});
test('keyboard focus returns to evidence summary after repaint',()=>{
 assert.ok(source.includes('focusedSummary&&focusedAsset'));
 assert.ok(source.includes("focus({preventScroll:true})"));
});
