// V254: event-sourced, opt-in quarterly research notifications.
// A zone status at startup is only a baseline, never a "new movement" alert.
const ACTIVE_STATES=new Set([
 'ABOVE_PREVIOUS_Q_HIGH','AT_PREVIOUS_Q_HIGH_ZONE',
 'BELOW_PREVIOUS_Q_LOW','AT_PREVIOUS_Q_LOW_ZONE',
 'BETWEEN_QUARTERLY_ZONES'
]);
const HIGH_LOW_COOLDOWN_MS=10*60*1000;
const CLOSE_OBSERVATION_GAP_MS=Object.freeze({bitcoin:3*60*1000,other:35*60*1000});
export function advanceQuarterWatch(ledger,classification,{armed=false,now=Date.now()}={}){
 const old=ledger instanceof Map?ledger:new Map();
 if(!classification)return Object.freeze({ledger:old,event:null,reason:'NO_VERIFIED_QUOTE'});
 const {asset,symbol,source,state,quarter,market_observed_at,capital_permission}=classification;
 const observedAt=Date.parse(String(market_observed_at||''));
 if(typeof asset!=='string'||!asset||typeof symbol!=='string'||!symbol||
 typeof quarter!=='string'||!quarter||!['Coinbase','Yahoo Finance'].includes(source)||
 !ACTIVE_STATES.has(state)||capital_permission!=='0R'||classification.not_execution_signal!==true||
 !Number.isFinite(now)||!Number.isFinite(observedAt)||observedAt>now+5000)return Object.freeze({
  ledger:old,event:null,reason:'INVALID_EVENT_EVIDENCE'
 });
 const before=old.get(asset);
 if(before&&observedAt<=before.observedAt)return Object.freeze({
  ledger:old,event:null,reason:'DUPLICATE_OR_OUT_OF_ORDER_SOURCE_TIMESTAMP'
 });
 const sameInstrument=before?.symbol===symbol&&before?.source===source&&before?.quarter===quarter;
 const maxGap=asset==='bitcoin'?CLOSE_OBSERVATION_GAP_MS.bitcoin:CLOSE_OBSERVATION_GAP_MS.other;
 const continuous=Boolean(sameInstrument&&observedAt-before.observedAt<=maxGap);
 const changed=continuous&&before.state!==state;
 const isZone=state!=='BETWEEN_QUARTERLY_ZONES';
 const cooldownSameClass=before?.lastEventState===state&&
  now-before.lastEventWallClock<HIGH_LOW_COOLDOWN_MS;
 const emit=Boolean(armed&&changed&&isZone&&!cooldownSameClass);
 const next=new Map(old);
 next.set(asset,{
  quarter,symbol,source,observedAt,state,
  lastEventState:emit?state:before?.lastEventState||null,
  lastEventWallClock:emit?now:before?.lastEventWallClock||0
 });
 const event=emit?Object.freeze({
  ...classification,
  previous_state:before.state,previous_market_observed_at:new Date(before.observedAt).toISOString(),
  evidence:'TWO_DISTINCT_ORDERED_VENDOR_OBSERVATIONS',browser_only:true,
  background_push_sent:false
 }):null;
 return Object.freeze({ledger:next,event,reason:emit?'NEW_VERIFIED_STATE_TRANSITION':
  !before?'FIRST_OBSERVATION_BASELINE':!continuous?'DISCONTINUOUS_EVIDENCE_BASELINE':
  !armed?'USER_NOT_OPTED_IN':!changed?'NO_ZONE_TRANSITION':
  !isZone?'RETURNED_INSIDE_RANGE':'EVENT_COOLDOWN'});
}
