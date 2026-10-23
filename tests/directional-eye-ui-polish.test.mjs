import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../src/directional-eye.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/directional-eye.css',import.meta.url),'utf8');
test('research provenance remains accessible in native expandable evidence',()=>{
 assert.ok(ui.includes("el('details','')"));assert.ok(ui.includes("el('summary','Evidence & scenario details')"));
 assert.ok(ui.includes("details.append(el('summary','Evidence & scenario details'),dl)"));
 assert.ok(ui.includes("row.state==='TRIGGER'||row.state==='ARMED'"));
});
test('unavailable, armed and trigger badges have distinct accessible styling',()=>{
 for(const state of ['unavailable','armed','trigger'])assert.ok(css.includes(`[data-state=${state}]`));
 assert.ok(css.includes('summary:focus-visible'));
});
