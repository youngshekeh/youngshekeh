import test from 'node:test';
import assert from 'node:assert/strict';
import {timingWindows} from '../src/directional-eye-core.mjs';
test('session conversion preserves London and New York DST boundaries',()=>{
 const cases=[
  [Date.UTC(2026,0,15,12),'09:00–11:00','15:30–17:30'],
  [Date.UTC(2026,2,20,12),'09:00–11:00','14:30–16:30'],
  [Date.UTC(2026,3,15,12),'08:00–10:00','14:30–16:30'],
  [Date.UTC(2026,9,23,12),'08:00–10:00','14:30–16:30'],
  [Date.UTC(2026,10,6,12),'09:00–11:00','15:30–17:30']
 ];
 for(const [when,london,ny] of cases){const v=timingWindows(when);assert.ok(v.london.includes(london),v.london);assert.ok(v.newYork.includes(ny),v.newYork);}
});
test('session windows reject invalid clock',()=>assert.throws(()=>timingWindows(NaN),RangeError));
