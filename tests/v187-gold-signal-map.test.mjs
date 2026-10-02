import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldSignalMap,signalWindows} from '../src/gold-signal-map.mjs';

const zones={price:4200,zones:[
 {timeframe:'daily',key:'d',low:4100,high:4300,mid:4200,location:{position_pct:50,zone:'EQUILIBRIUM'}},
 {timeframe:'weekly',key:'w',low:4000,high:4400,mid:4200,location:{position_pct:50,zone:'EQUILIBRIUM'}},
 {timeframe:'monthly',key:'m',low:3900,high:4500,mid:4200,location:{position_pct:50,zone:'EQUILIBRIUM'}},
 {timeframe:'quarterly',key:'q',low:3800,high:4600,mid:4200,location:{position_pct:50,zone:'EQUILIBRIUM'}},
 {timeframe:'yearly',key:'y',low:3500,high:5000,mid:4250,location:{position_pct:46.7,zone:'MID'}}
],daily_pivots:{pivot:4200,s1:4150,r1:4250},composite:{state:'MIXED',average_position_pct:50}};
const day={day_state:{day_state:'HIGH_SWEEP_REJECTION',framework_signal_day:true,range_vs_adr:1.4,breakout_quality:72}};
const confluence={intraday:{phase:'HIGH_LIQUIDITY_RAID_REJECTION',direction:'DOWN_REPAIR',acceptance:'REJECTION_ACCEPTED',pressure_score:-2,extension_state:'EXTENDED'},
 multi_timeframe:{state:'MULTI_TF_DISCOUNT_PRESSURE',average_position_pct:20},
 confluence:{nearest_above_cluster:{center:4220,low:4218,high:4222,strength:3,labels:['A']},nearest_below_cluster:{center:4160,low:4158,high:4162,strength:2,labels:['B']}}};
const breakout={dominant_state:'FAILED_BREAKOUT_UP',upside:{first_break_ts:1790900000,bars_since_break:20,acceptance_minutes:0,quality_score:40,false_breakout_risk:'CONFIRMED_FAILURE'}};
const live={state:'BROKER_LIVE',quote:{mid:4180,bid:4179.9,ask:4180.1,age_seconds:0.5,trade_mode:'REAL'}};

test('signal day + NY window + fresh live quote yields active deterministic signal time without execution authority',()=>{
 const now=new Date('2026-10-02T13:00:00Z'); // 09:00 New York EDT
 const out=buildGoldSignalMap({now,live,day,zones,confluence,breakout});
 assert.equal(out.signal_day.state,'SIGNAL_DAY_CONFIRMED');
 assert.equal(out.signal_time.active_window,'NEW_YORK');
 assert.equal(out.signal_time.state,'ACTIVE_SIGNAL_TIME');
 assert.equal(out.signal_time.direction_candidate,'SHORT_REPAIR_BIAS');
 assert.equal(out.governance.action_permitted,'WAIT');
 assert.equal(out.governance.capital_permission,'0R');
 assert.equal(out.governance.automatic_execution,false);
});
test('live XAUUSD basis translates every timeframe zone',()=>{
 const out=buildGoldSignalMap({now:new Date('2026-10-02T18:00:00Z'),live,day,zones,confluence,breakout});
 assert.equal(out.live_anchor.futures_spot_basis_usd,20);
 assert.equal(out.tradeable_zones.zones.length,5);
 assert.deepEqual(out.tradeable_zones.zones[0].lower_zone,{low:4080,high:4130});
 assert.equal(out.tradeable_zones.pivots.pivot,4180);
});
test('missing broker tick preserves structural zones but cannot claim active live signal time',()=>{
 const out=buildGoldSignalMap({now:new Date('2026-10-02T13:00:00Z'),live:{state:'WAITING_FOR_LIVE_MARKET_BRIDGE'},day,zones,confluence,breakout});
 assert.equal(out.live_anchor.state,'STRUCTURAL_FALLBACK');
 assert.equal(out.signal_time.state,'SIGNAL_WINDOW_WAITING_FOR_LIVE_XAUUSD');
 assert.equal(out.tradeable_zones.price_basis,'GC_FUTURES_STRUCTURE');
 assert.equal(out.live_anchor.futures_spot_basis_usd,null);
 assert.equal(out.governance.machine_execution_allowed,false);
});
test('normal day inside a session does not become a signal day',()=>{
 const normal={day_state:{day_state:'BALANCED',framework_signal_day:false,range_vs_adr:.6,breakout_quality:20}};
 const out=buildGoldSignalMap({now:new Date('2026-10-02T13:00:00Z'),live,day:normal,zones,confluence:{},breakout:{}});
 assert.equal(out.signal_day.state,'NORMAL_DAY');
 assert.equal(out.signal_time.state,'WINDOW_ACTIVE_NO_CONFIRMED_SIGNAL_DAY');
});
test('session detector uses local London and New York clocks',()=>{
 const w=signalWindows(new Date('2026-10-02T13:00:00Z'));
 assert.equal(w.active_window,'NEW_YORK');
 assert.equal(w.clocks.new_york,'09:00');
});
