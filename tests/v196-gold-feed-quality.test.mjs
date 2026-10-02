import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoldFeedQuality} from '../src/gold-feed-quality-v196.mjs';

const now=new Date('2026-10-02T21:00:10Z');
const tick=(s,obs,extra={})=>({
  received_at:new Date(Date.parse(obs)+250).toISOString(),
  observed_at:obs,sequence:s,trade_mode:'DEMO',bid:4172.1,ask:4172.3,spread_usd:0.2,
  terminal_connected:true,relay_version:'v186.0',mt5_package_version:'5.0.6231',os_family:'Windows',...extra
});

test('V196 does not certify an empty feed',()=>{
  const out=buildGoldFeedQuality({now,ticks:[]});
  assert.equal(out.state,'NO_TICKS');
  assert.equal(out.gates.freshness.pass,false);
  assert.equal(out.governance.capital_permission,'0R');
});

test('V196 keeps the first fresh tick in probation',()=>{
  const out=buildGoldFeedQuality({now,ticks:[tick(1,'2026-10-02T21:00:09Z')]});
  assert.equal(out.state,'PROBATION_WARMING');
  assert.equal(out.gates.freshness.pass,true);
  assert.equal(out.gates.cadence.pass,false);
  assert.ok(out.deterministic_quality_score<100);
});

test('V196 certifies sustained ordered fresh ticks without opening execution',()=>{
  const ticks=[
    tick(10,'2026-10-02T21:00:03Z'),
    tick(12,'2026-10-02T21:00:06Z'),
    tick(15,'2026-10-02T21:00:09Z')
  ];
  const out=buildGoldFeedQuality({now,ticks});
  assert.equal(out.state,'LIVE_FEED_QUALITY_PASS');
  assert.equal(out.deterministic_quality_score,100);
  assert.equal(out.gates.sequence_integrity.pass,true);
  assert.equal(out.governance.feed_quality_cannot_grant_trade_permission,true);
  assert.equal(out.governance.live_order_submission_enabled,false);
  assert.equal(out.governance.action_permitted,'WAIT');
});

test('V196 fails quality when sequence regresses',()=>{
  const ticks=[
    tick(10,'2026-10-02T21:00:03Z'),
    tick(9,'2026-10-02T21:00:06Z'),
    tick(15,'2026-10-02T21:00:09Z')
  ];
  const out=buildGoldFeedQuality({now,ticks});
  assert.equal(out.state,'FEED_QUALITY_DEGRADED');
  assert.equal(out.gates.sequence_integrity.pass,false);
});
