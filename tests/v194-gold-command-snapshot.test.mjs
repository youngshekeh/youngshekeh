import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldCommandSnapshot} from '../src/gold-command-v194.mjs';

const base={
  live:{ok:true,state:'WAITING_FOR_LIVE_MARKET_BRIDGE',quality:{fresh:false},quote:null,checked_at:'2026-10-02T20:30:00Z',version:'v186-live-xauusd-v1'},
  signal:{ok:true,state:'AVAILABLE',generated_at:'2026-10-02T20:30:00Z',version:'v187-xauusd-signal-map-v1',
    signal_day:{state:'SIGNAL_DAY_CONFIRMED',score:85},
    signal_time:{state:'OUTSIDE_SIGNAL_WINDOW',direction_candidate:'LONG_REPAIR_BIAS'},
    live_anchor:{state:'STRUCTURAL_FALLBACK',price:4171.7},
    tradeable_zones:{zones:[{timeframe:'DAILY',state:'LOWER_TRADEABLE_ZONE',position_pct:17,lower_zone:{low:4153.8,high:4180.1}}]}},
  lifecycle:{ok:true,state:'AVAILABLE',generated_at:'2026-10-02T20:30:00Z',version:'v188.1-gold-signal-lifecycle-api-v1',
    anchor:{state:'STRUCTURAL_FALLBACK',price:4171.7},
    lifecycle:{stage:'OFF_WINDOW_STRUCTURE_WATCH',next_condition:'Wait for the next qualified timing window.'}},
  watch:{ok:true,state:'WAITING_FOR_LIVE_XAUUSD',generated_at:'2026-10-02T20:30:00Z',version:'v189-gold-trigger-watch-v1',
    review_gate:{ready:false,requirements:{signal_day_confirmed:true,signal_time_active:false,fresh_broker_xauusd:false,liquidity_transition_resolved:true}},
    decision_compression:{what_matters:'Attach V186 read-only MT5.'}},
  ledger:{ok:true,state:'HASH_CHAIN_VERIFIED',generated_at:'2026-10-02T20:30:00Z',version:'v191-gold-signal-event-ledger-v1',
    counts:{events:16,chain_failures:0},latest_event_at:'2026-10-02T20:14:04Z',
    events:[{event_key:'TRIGGER:WEEKLY_LOWER_ZONE',previous_state:'BLOCKED',event_state:'BLOCKED',condition:'WEEKLY_LOWER_ZONE_APPROACH',event_at:'2026-10-02T20:14:04Z'}]},
  router:{ok:true,state:'ROUTER_CHAIN_VERIFIED',generated_at:'2026-10-02T20:30:00Z',version:'v192-gold-alert-router-v1',
    counts:{visible_alerts:0,notification_ready:0,chain_failures:0}}
};

test('V194 compresses V186-V193 without opening capital',()=>{
  const out=buildGoldCommandSnapshot({...base,now:new Date('2026-10-02T20:31:00Z')});
  assert.equal(out.ok,true);
  assert.equal(out.version,'v194-gold-command-snapshot-v1');
  assert.equal(out.state,'WAITING_FOR_LIVE_XAUUSD');
  assert.equal(out.command.signal_day,'SIGNAL_DAY_CONFIRMED');
  assert.equal(out.command.live_price,null);
  assert.ok(out.blockers.includes('FRESH_BROKER_XAUUSD'));
  assert.ok(out.blockers.includes('SIGNAL_TIME_NOT_ACTIVE'));
  assert.equal(out.components.owner_alert_inbox.state,'AAL2_OWNER_ONLY');
  assert.equal(out.governance.action_permitted,'WAIT');
  assert.equal(out.governance.capital_permission,'0R');
  assert.equal(out.governance.automatic_execution,false);
  assert.equal(out.governance.live_order_submission_enabled,false);
});

test('V194 can surface human review readiness while execution remains locked',()=>{
  const live={...base.live,state:'BROKER_LIVE',quality:{fresh:true},quote:{mid:4172.25}};
  const signal={...base.signal,signal_time:{state:'ACTIVE_SIGNAL_TIME',direction_candidate:'LONG_REPAIR_BIAS'}};
  const watch={...base.watch,state:'HUMAN_REVIEW_READY',review_gate:{ready:true,requirements:{signal_day_confirmed:true,signal_time_active:true,fresh_broker_xauusd:true,liquidity_transition_resolved:true}}};
  const out=buildGoldCommandSnapshot({...base,live,signal,watch,now:new Date('2026-10-02T20:31:00Z')});
  assert.equal(out.state,'HUMAN_REVIEW_READY');
  assert.equal(out.command.live_price,4172.25);
  assert.equal(out.blockers.length,0);
  assert.equal(out.decision_compression.action_permitted,'WAIT');
  assert.equal(out.decision_compression.capital_permission,'0R');
});

test('V194 fails closed when a core upstream is unavailable',()=>{
  const out=buildGoldCommandSnapshot({...base,router:{ok:false,state:'UNAVAILABLE'},now:new Date('2026-10-02T20:31:00Z')});
  assert.equal(out.ok,false);
  assert.equal(out.state,'DATA_DEGRADED');
  assert.ok(out.blockers.includes('UPSTREAM_ALERT_ROUTER_UNAVAILABLE'));
  assert.equal(out.governance.machine_execution_allowed,false);
});
