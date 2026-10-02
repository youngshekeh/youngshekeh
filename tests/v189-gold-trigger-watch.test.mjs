import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldTriggerWatch,nextSignalWindow} from '../src/gold-trigger-watch-v189.mjs';

const lifecycle={
 ok:true,anchor:{state:'BROKER_LIVE',price:4175},
 lifecycle:{stage:'RECLAIM_ACCEPTED'},day_dna:{day_state:'LOW_SWEEP_REJECTION'},
 signal_day:{state:'SIGNAL_DAY_CONFIRMED',score:90},
 signal_time:{state:'ACTIVE_SIGNAL_TIME',active_window:'NEW_YORK',direction_candidate:'LONG_REPAIR_BIAS',
   event:{dominant_state:'FAILED_BREAKOUT_DOWN',quality_score:70}},
 structural_state:{phase:'LOW_LIQUIDITY_RAID_RECLAIM',acceptance:'REJECTION_ACCEPTED',extension_state:'EXPANDING'},
 multi_timeframe:{zones:[
   {timeframe:'DAILY',lower_zone:{low:4170,high:4180}},
   {timeframe:'WEEKLY',lower_zone:{low:4160,high:4172}}
 ]},
 session_liquidity:{nearest_above:{session:'ASIA',kind:'LOW',price:4177,distance:2},nearest_below:{session:'NEW_YORK',kind:'LOW',price:4168,distance:-7}}
};

test('all V189 review prerequisites produce human-review-ready but never execution permission',()=>{
 const x=buildGoldTriggerWatch({now:new Date('2026-10-02T13:00:00Z'),lifecycle});
 assert.equal(x.state,'HUMAN_REVIEW_READY');assert.equal(x.review_gate.ready,true);
 assert.equal(x.governance.capital_permission,'0R');assert.equal(x.governance.machine_execution_allowed,false);
 assert(x.triggers.some(t=>t.id==='DAILY_LOWER_ZONE'&&t.state==='ACTIVE_REVIEW'));
 assert(x.triggers.some(t=>t.id==='SESSION_LIQUIDITY_PROXIMITY'&&t.state==='ACTIVE_REVIEW'));
});
test('missing live broker quote blocks proximity review',()=>{
 const x=buildGoldTriggerWatch({now:new Date('2026-10-02T13:00:00Z'),lifecycle:{...lifecycle,anchor:{state:'STRUCTURAL_FALLBACK',price:4175}}});
 assert.equal(x.state,'WAITING_FOR_LIVE_XAUUSD');assert.equal(x.review_gate.ready,false);
 assert.equal(x.triggers.find(t=>t.id==='DAILY_LOWER_ZONE').state,'BLOCKED');
 assert.equal(x.triggers.find(t=>t.id==='SESSION_LIQUIDITY_PROXIMITY').state,'BLOCKED');
});
test('next window detector respects New York DST-local timing',()=>{
 const n=nextSignalWindow(new Date('2026-10-02T12:00:00Z')); // 08:00 EDT
 assert.equal(n.next.key,'NEW_YORK');assert.equal(n.next.phase,'PREP');assert.equal(n.next.minutes_to_start,20);
});
test('off-window signal day waits for timing',()=>{
 const x=buildGoldTriggerWatch({now:new Date('2026-10-02T18:00:00Z'),lifecycle:{...lifecycle,signal_time:{...lifecycle.signal_time,state:'OUTSIDE_SIGNAL_WINDOW',active_window:null}}});
 assert.equal(x.state,'WAITING_FOR_SIGNAL_TIME');assert.equal(x.review_gate.ready,false);
});
