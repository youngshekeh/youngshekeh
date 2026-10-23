import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advanceQuarterWatch} from '../src/quarterly-alert-observer.mjs';
import {classifyQuarterAlert} from '../src/quarterly-alert-rules.mjs';
const base=Date.parse('2026-10-23T15:00:00Z');
const zone={
 asset:'wti',label:'WTI futures',symbol:'CL=F',previous_quarter:'Q3 2026',
 previous_low:90,previous_high:110,
 governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}
};
function at(t){return new Date(t).toISOString()}
function assessment(price,minutes=0,assetZone=zone,source='Yahoo Finance'){
 const now=base+minutes*60000;
 const quote={value:price,at:at(now-20_000),source};
 return classifyQuarterAlert(assetZone,quote,now);
}
test('opening an alert-enabled page already at Q3 high seeds baseline, no retroactive notification',()=>{
 const observed=advanceQuarterWatch(new Map(),assessment(109.8),{armed:true,now:base});
 assert.equal(observed.event,null);
 assert.equal(observed.reason,'FIRST_OBSERVATION_BASELINE');
 assert.equal(observed.ledger.get('wti')?.state,'AT_PREVIOUS_Q_HIGH_ZONE');
 assert.equal(observed.ledger.get('wti')?.observedAt,base-20_000);
});
test('same vendor market timestamp cannot generate an event even if payload price changes',()=>{
 const original=assessment(107,0);
 const seed=advanceQuarterWatch(new Map(),original,{armed:true,now:base});
 const spoofed={...assessment(111,0),market_observed_at:original.market_observed_at};
 const rejected=advanceQuarterWatch(seed.ledger,spoofed,{armed:true,now:base+1000});
 assert.equal(rejected.event,null);
 assert.equal(rejected.reason,'DUPLICATE_OR_OUT_OF_ORDER_SOURCE_TIMESTAMP');
 assert.equal(rejected.ledger.get('wti')?.state,'BETWEEN_QUARTERLY_ZONES');
});
test('new, time-ordered observation entering quarterly upper band fires once',()=>{
 const one=advanceQuarterWatch(new Map(),assessment(105,0),{armed:true,now:base});
 const two=advanceQuarterWatch(one.ledger,assessment(109.8,2),{armed:true,now:base+120000});
 assert.equal(two.reason,'NEW_VERIFIED_STATE_TRANSITION');
 assert.equal(two.event.previous_state,'BETWEEN_QUARTERLY_ZONES');
 assert.equal(two.event.state,'AT_PREVIOUS_Q_HIGH_ZONE');
 assert.equal(two.event.source,'Yahoo Finance');
 assert.equal(two.event.symbol,'CL=F');
 assert.equal(two.event.evidence,'TWO_DISTINCT_ORDERED_VENDOR_OBSERVATIONS');
 assert.equal(two.event.background_push_sent,false);
 assert.equal(two.event.capital_permission,'0R');
 const again=advanceQuarterWatch(two.ledger,assessment(109.8,2),{armed:true,now:base+123000});
 assert.equal(again.event,null);
});
test('crossing from upper band to above previous-quarter high is a distinct observation',()=>{
 let r=advanceQuarterWatch(new Map(),assessment(108,0),{armed:true,now:base});
 r=advanceQuarterWatch(r.ledger,assessment(111,1),{armed:true,now:base+60000});
 assert.ok(r.event);assert.equal(r.event.state,'ABOVE_PREVIOUS_Q_HIGH');
 assert.equal(r.event.not_execution_signal,true);
});
test('reaching prior level while alerts OFF is a baseline, not an event when user enables',()=>{
 let r=advanceQuarterWatch(new Map(),assessment(105,0),{armed:false,now:base});
 r=advanceQuarterWatch(r.ledger,assessment(109.8,1),{armed:false,now:base+60000});
 assert.equal(r.event,null);
 r=advanceQuarterWatch(r.ledger,assessment(109.8,1),{armed:true,now:base+61000});
 assert.equal(r.event,null);
 assert.equal(r.reason,'DUPLICATE_OR_OUT_OF_ORDER_SOURCE_TIMESTAMP');
 r=advanceQuarterWatch(r.ledger,assessment(111,2),{armed:true,now:base+120000});
 assert.ok(r.event);
 assert.equal(r.event.state,'ABOVE_PREVIOUS_Q_HIGH');
});
test('disconnected market samples across a long gap are seeded rather than inventing a crossing',()=>{
 let r=advanceQuarterWatch(new Map(),assessment(105,0),{armed:true,now:base});
 r=advanceQuarterWatch(r.ledger,assessment(111,40),{armed:true,now:base+40*60000});
 assert.equal(r.event,null);
 assert.equal(r.reason,'DISCONTINUOUS_EVIDENCE_BASELINE');
 r=advanceQuarterWatch(r.ledger,assessment(109.8,41),{armed:true,now:base+41*60000});
 assert.equal(r.event.state,'AT_PREVIOUS_Q_HIGH_ZONE');
});
test('Bitcoin requires tightly adjacent Coinbase observations, not a stale gap',()=>{
 const btc={...zone,asset:'bitcoin',symbol:'BTC-USD',label:'Bitcoin spot',previous_high:87000,previous_low:65000};
 const btcAssessment=(price,minutes)=>assessment(price,minutes,btc,'Coinbase');
 let r=advanceQuarterWatch(new Map(),btcAssessment(84000,0),{armed:true,now:base});
 r=advanceQuarterWatch(r.ledger,btcAssessment(87010,4),{armed:true,now:base+240000});
 assert.equal(r.event,null);
 assert.equal(r.reason,'DISCONTINUOUS_EVIDENCE_BASELINE');
 r=advanceQuarterWatch(r.ledger,btcAssessment(86900,5),{armed:true,now:base+300000});
 assert.equal(r.event.state,'AT_PREVIOUS_Q_HIGH_ZONE');
});
test('new completed-quarter identity and provider symbol cannot re-use previous quarter baseline',()=>{
 let r=advanceQuarterWatch(new Map(),assessment(105,0),{armed:true,now:base});
 const changed={...assessment(111,2),quarter:'Q4 2026'};
 r=advanceQuarterWatch(r.ledger,changed,{armed:true,now:base+120000});
 assert.equal(r.event,null);assert.equal(r.reason,'DISCONTINUOUS_EVIDENCE_BASELINE');
 const other={...assessment(109.8,3),symbol:'BZ=F'};
 r=advanceQuarterWatch(r.ledger,other,{armed:true,now:base+180000});
 assert.equal(r.event,null);
});
test('wrong source, capital privileges, malformed status or future timestamp remain denied',()=>{
 const b=assessment(105,0);
 for(const altered of [
  {...b,source:'Unknown'},
  {...b,capital_permission:'1R'},
  {...b,not_execution_signal:false},
  {...b,state:'WINNING_TRADES'},
  {...b,market_observed_at:'2050-01-01T00:00:00Z'},
  {...b,market_observed_at:'invalid'}
 ]){
  const result=advanceQuarterWatch(new Map(),altered,{armed:true,now:base});
  assert.equal(result.event,null);
  assert.equal(result.reason,'INVALID_EVENT_EVIDENCE');
 }
});
test('cooldown avoids repeated same upper-zone alerts across oscillations',()=>{
 let r=advanceQuarterWatch(new Map(),assessment(105,0),{armed:true,now:base});
 r=advanceQuarterWatch(r.ledger,assessment(109.8,1),{armed:true,now:base+60000});
 assert.ok(r.event);
 r=advanceQuarterWatch(r.ledger,assessment(105,2),{armed:true,now:base+120000});
 assert.equal(r.event,null);
 r=advanceQuarterWatch(r.ledger,assessment(109.8,3),{armed:true,now:base+180000});
 assert.equal(r.event,null);assert.equal(r.reason,'EVENT_COOLDOWN');
});
test('invalid or unavailable snapshot cannot change the market observation ledger',()=>{
 const seed=advanceQuarterWatch(new Map(),assessment(105,0),{armed:false,now:base});
 const result=advanceQuarterWatch(seed.ledger,null,{armed:true,now:base+120000});
 assert.equal(result.event,null);assert.strictEqual(result.ledger,seed.ledger);
});
test('production UI polls three independent market sources, no background service, no fake historical replay',()=>{
 const src=readFileSync(new URL('../src/quarterly-observatory.mjs',import.meta.url),'utf8');
 const html=readFileSync(new URL('../market-observatory/index.html',import.meta.url),'utf8');
 assert.match(src,/advanceQuarterWatch\(observations,classified,\{armed:alertsArmed,now\}\)/);
 assert.match(src,/getBitcoinQuote\(now\)/);
 assert.match(src,/verifyMacroPacket\(macroPacket,now\)/);
 assert.match(src,/asset==='wti'\|\|asset==='dxy'/);
 for(const path of ['/api/public-quarterly-zones','/api/public-market-reference','/api/public-macro-reference'])
  assert.ok(src.includes(path),path);
 assert.match(src,/window\.setInterval\(\(\)=>\{if\(!document.hidden\)void fetchZoneData\(\)\},60000\)/);
 assert.match(src,/Notification\.requestPermission\(\)/);
 assert.match(src,/alertsArmed=false/);
 assert.match(html,/Tab alerts OFF/);
 assert.match(html,/background push, SMS and email delivery are not enabled/);
 assert.doesNotMatch(src,/SERVICE_ROLE|cron\.alter_job|place_order|execute_trade|navigator\.serviceWorker|localStorage|Notification\.requestPermission\(\)[^]*?document\.getElementById\('quarter-zones'\)/);
});
