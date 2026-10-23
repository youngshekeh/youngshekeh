import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredRanges} from '../src/directional-eye-ranges.mjs';
import {evaluateEye} from '../src/directional-eye-core.mjs';
const day=86400000,now=Date.UTC(2026,9,23,12),today=Math.floor(now/day)*day;
const daily=()=>Array.from({length:100},(_,i)=>({t:today-(99-i)*day,o:100,h:110+i,l:90,c:105,v:10}));
test('UTC ranges cover actual calendar start and include incomplete current day',()=>{
 const r=measuredRanges(daily(),now);
 assert.equal(r.status,'OBSERVED_RANGES');assert.equal(r.periods.Daily.daily_buckets,1);
 assert.equal(r.periods.Weekly.daily_buckets,5);assert.equal(r.periods.Monthly.daily_buckets,23);assert.equal(r.periods.Quarterly.daily_buckets,23);
 assert.equal(r.periods.Daily.high,209);assert.equal(r.periods.Quarterly.low,90);assert.equal(r.periods.Daily.complete,false);assert.equal(r.source_update_time,null);
 assert.deepEqual(r.periods.Daily.battlefield,[137.6,161.39999999999998]);
});
test('daily gaps, duplicates, malformed bars, future buckets and non-UTC starts reject ranges',()=>{
 for(const mutate of [r=>r.splice(10,1),r=>r[5].t=r[4].t,r=>r[2].l=1000,r=>r.at(-1).t+=day,r=>r[1].t+=1000,r=>r[0].v=-1]){const a=daily();mutate(a);assert.equal(measuredRanges(a,now).status,'UNAVAILABLE');}
});
test('missing period history is withheld instead of synthesizing extremes',()=>{
 const r=measuredRanges(daily().slice(-2),now);assert.equal(r.periods.Daily.status,'OBSERVED_IN_PROGRESS');assert.equal(r.periods.Weekly.status,'UNAVAILABLE');
 const stale=daily().slice(0,-1);assert.equal(measuredRanges(stale,now).reason,'CURRENT_DAY_BUCKET_MISSING');
});
test('eye expiry cannot outlive minute candle evidence',()=>{
 const series=step=>Array.from({length:65},(_,i)=>({t:now-(65-i)*step,o:100,h:101,l:99,c:100,v:10}));
 const r=evaluateEye({asset:'Bitcoin',source:'fixture',oneMinute:series(60000),fiveMinute:series(300000),now});
 assert.equal(Date.parse(r.expires_at),now+120000);
});
