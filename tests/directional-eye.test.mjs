import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateEye,validateCandles,timingWindows} from '../src/directional-eye-core.mjs';
const now=Date.UTC(2026,9,23,12);
const series=step=>Array.from({length:65},(_,i)=>({t:now-(65-i)*step,o:100,h:101,l:99,c:100,v:10}));
const input=()=>({asset:'Bitcoin',source:'test fixture',oneMinute:series(60000),fiveMinute:series(300000),now});
test('missing, stale, gapped and malformed candles withhold direction',()=>{
 for(const mutate of [x=>x.fiveMinute=[],x=>x.now+=1000000,x=>x.oneMinute[20].t+=1000,x=>x.fiveMinute[20].l=102,x=>x.oneMinute[20].v=NaN]){
  const x=input();mutate(x);assert.equal(evaluateEye(x).state,'UNAVAILABLE');
 }
});
test('breakout and retest with 1m agreement generates research trigger, never permission',()=>{
 const x=input();Object.assign(x.fiveMinute.at(-2),{o:100,h:104,l:100,c:103});Object.assign(x.fiveMinute.at(-1),{o:103,h:104,l:101,c:103,v:30});Object.assign(x.oneMinute.at(-1),{o:100,h:104,l:99,c:103});
 const r=evaluateEye(x);assert.equal(r.state,'TRIGGER');assert.equal(r.direction,'UP');assert.equal(r.capital_permission,'0R');assert.equal(r.probability,null);assert.ok(r.levels.invalidation<r.levels.trigger);assert.ok(r.levels.targets[0]>r.levels.trigger);
 assert.equal(r.forecast_id,evaluateEye(x).forecast_id);
});
test('breakdown retest is symmetric',()=>{
 const x=input();Object.assign(x.fiveMinute.at(-2),{o:100,h:100,l:96,c:97});Object.assign(x.fiveMinute.at(-1),{o:97,h:99,l:96,c:97,v:30});Object.assign(x.oneMinute.at(-1),{o:100,h:101,l:96,c:97});
 const r=evaluateEye(x);assert.equal(r.state,'TRIGGER');assert.equal(r.direction,'DOWN');assert.ok(r.levels.invalidation>r.levels.trigger);
});
test('unconfirmed minute data blocks trigger; open candle cannot trigger',()=>{
 const x=input();Object.assign(x.fiveMinute.at(-2),{o:100,h:104,l:100,c:103});Object.assign(x.fiveMinute.at(-1),{o:103,h:104,l:101,c:103});
 assert.notEqual(evaluateEye(x).state,'TRIGGER');
 const open={t:now,o:100,h:500,l:1,c:400,v:1000};x.fiveMinute.push(open);assert.notEqual(evaluateEye(x).state,'TRIGGER');
});
test('DST-aware windows shift WAT cash open; no success probability inferred',()=>{
 assert.match(timingWindows(Date.UTC(2026,9,23)).newYork,/14:30/);
 assert.match(timingWindows(Date.UTC(2026,10,6)).newYork,/15:30/);
 assert.equal(evaluateEye(input()).probability,null);
});
test('duplicate timestamps, too little data, missing attribution rejected',()=>{
 const a=series(60000);a[20].t=a[19].t;assert.equal(validateCandles(a,60000,now),null);
 const x=input();x.source='';assert.equal(evaluateEye(x).state,'UNAVAILABLE');
});
test('conflicting 1m and 5m prices withhold signal',()=>{
 const x=input();Object.assign(x.oneMinute.at(-1),{o:200,h:201,l:199,c:200});
 assert.equal(evaluateEye(x).state,'UNAVAILABLE');
});
test('sweep of both range extremes never invents a direction',()=>{
 const x=input();Object.assign(x.fiveMinute.at(-1),{o:100,h:105,l:95,c:100,v:30});
 assert.equal(evaluateEye(x).direction,'UNCONFIRMED');
});
test('candle inspection explains rejection without relaxing freshness or continuity',async()=>{
 const {inspectCandles}=await import('../src/directional-eye-core.mjs');
 const x=input();assert.equal(inspectCandles(x.oneMinute,60000,now).status,'VALIDATED');
 assert.equal(inspectCandles(x.oneMinute,60000,now+180001).reason,'STALE_CANDLES');
 const g=series(60000);g[20].t=g[19].t;
 assert.equal(inspectCandles(g,60000,now).reason,'GAPPED_OR_DUPLICATE_CANDLES');
 const f=series(60000);f.push({...f.at(-1),t:now+60000});assert.equal(inspectCandles(f,60000,now).reason,'FUTURE_CANDLE');
 const bad=series(60000);bad[3].t+=1000;assert.equal(inspectCandles(bad,60000,now).reason,'INVALID_CANDLE');
});
