import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldSignalLifecycle} from '../src/gold-signal-lifecycle.mjs';
const signal={ok:true,live_anchor:{state:'BROKER_LIVE',price:4180,futures_spot_basis_usd:20},
 signal_day:{state:'SIGNAL_DAY_CONFIRMED'},
 signal_time:{state:'ACTIVE_SIGNAL_TIME',active_window:'NEW_YORK',direction_candidate:'SHORT_REPAIR_BIAS'},
 tradeable_zones:{zones:[{timeframe:'DAILY',state:'LOWER_TRADEABLE_ZONE'}]}};
const liquidity={state:{phase:'HIGH_LIQUIDITY_RAID_REJECTION',direction:'DOWN_REPAIR',acceptance:'REJECTION_ACCEPTED',
 extension_state:'EXTENDED',exhaustion_risk:'WATCH',failed_break_risk:'NORMAL',invalidation_level:4222.8,evidence:['x']}};
const sessions={ok:true,sessions:[
 {key:'ASIA',label:'Tokyo',state:'OFF',sweep_state:'INSIDE_PRIOR_RANGE',latest:{date:'2026-10-02',open:4200,high:4210,low:4190,close:4205,range:20,bars:24,opening_range:{high:4205,low:4195,range:10,bars:6}}},
 {key:'LONDON',label:'London',state:'OFF',sweep_state:'LOW_SWEEP_REJECTION',latest:{date:'2026-10-02',open:4205,high:4220,low:4180,close:4210,range:40,bars:30,opening_range:{high:4212,low:4192,range:20,bars:6}}},
 {key:'NEW_YORK',label:'COMEX',state:'ACTIVE',sweep_state:'HIGH_SWEEP_REJECTION',latest:{date:'2026-10-02',open:4210,high:4230,low:4170,close:4185,range:60,bars:20,opening_range:{high:4225,low:4195,range:30,bars:6}}}
],cross_session:{london_vs_asia:{state:'LOW_RAID_REJECTION',reference_high:4210,reference_low:4190,active_high:4220,active_low:4180,active_close:4210},
new_york_vs_london:{state:'HIGH_RAID_REJECTION',reference_high:4220,reference_low:4180,active_high:4230,active_low:4170,active_close:4185}}};
test('lifecycle reaches exhaustion watch only inside active signal time',()=>{
 const x=buildGoldSignalLifecycle({signal,liquidity,sessions});
 assert.equal(x.lifecycle.stage,'EXTENSION_EXHAUSTION_WATCH');
 assert.equal(x.lifecycle.detector_score,100);
 assert.equal(x.governance.capital_permission,'0R');
 assert.equal(x.governance.machine_execution_allowed,false);
});
test('session levels translate by the GC-XAU basis',()=>{
 const x=buildGoldSignalLifecycle({signal,liquidity,sessions});
 const london=x.session_liquidity.sessions.find(s=>s.key==='LONDON');
 assert.equal(london.latest.high,4200);
 assert.equal(london.latest.low,4160);
 assert.equal(x.structural_state.invalidation_level,4202.8);
 assert.equal(x.session_liquidity.nearest_above.distance,5);
});
test('outside signal window cannot claim active lifecycle',()=>{
 const s={...signal,signal_time:{state:'OUTSIDE_SIGNAL_WINDOW',active_window:null,direction_candidate:'SHORT_REPAIR_BIAS'}};
 const x=buildGoldSignalLifecycle({signal:s,liquidity,sessions});
 assert.equal(x.lifecycle.stage,'OFF_WINDOW_STRUCTURE_WATCH');
 assert.equal(x.flags.signal_window_active,false);
});
test('no live basis preserves GC levels and flags missing live anchor',()=>{
 const s={...signal,live_anchor:{state:'STRUCTURAL_FALLBACK',price:4200,futures_spot_basis_usd:null}};
 const x=buildGoldSignalLifecycle({signal:s,liquidity,sessions});
 assert.equal(x.anchor.level_basis,'GC_FUTURES_STRUCTURE');
 assert.equal(x.session_liquidity.sessions[0].latest.high,4210);
 assert.equal(x.lifecycle.live_anchor_required,true);
 assert.equal(x.session_liquidity.sessions[0].price_relation,'MID_RANGE');
});
