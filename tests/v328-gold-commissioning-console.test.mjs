import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const ui=readFileSync(new URL('../src/gold-commissioning-v328.mjs',import.meta.url),'utf8');
const workspace=readFileSync(new URL('../src/gold-workspace.mjs',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/gold-commissioning-v328.css',import.meta.url),'utf8');
const evaluated=ui
 .replace(/^import\s+['"].*?['"];?\s*$/gm,'')
 .replace(/\bexport function\b/g,'function');
const model=runInNewContext(evaluated+'\n;brokerCommissioningModel',
  {Date,Math,Number,Object,String}, {timeout:3000});
const NOW=Date.parse('2026-10-27T08:40:00.000Z');
const fresh=(delta=1000)=>new Date(NOW-delta).toISOString();
function fixture(opts={}){
 const data={
  ok:true,version:'v326-gold-bridge-first-tick-truth-review',
  state:'BROKER_LIVE',
  gates:{
   bridge_enrolled:{pass:true,count:1},
   bridge_authenticated:{pass:true},
   first_tick_received:{
     pass:true,observed_at:fresh(),proof:'PERSISTED_TICK_NOT_CREDENTIAL_USE'
   },
   quote_fresh:{pass:true},
   broker_live:{pass:true}
  },
  governance:{
   automatic_execution:false,machine_execution_allowed:false,
   live_order_submission_enabled:false,capital_permission:'0R'
  }
 };
 if(opts.gates)for(const [key,value] of Object.entries(opts.gates))
  data.gates[key]={...data.gates[key],...value};
 if(opts.governance)Object.assign(data.governance,opts.governance);
 if(opts.version) data.version=opts.version;
 if(opts.state) data.state=opts.state;
 if(opts.ok===false) data.ok=false;
 return data;
}

test('null backend fails closed with four visible gates and WAIT/0R',()=>{
 const x=model(null,NOW);
 assert.equal(x.status,'DATA_NOT_VERIFIED');
 assert.equal(x.proof,'NO_VERIFIABLE_TICK_CONTRACT');
 assert.equal(x.stages.length,4);
 assert.deepEqual(Array.from(x.stages,s=>s.status),
   ['waiting','unverified','unverified','unverified']);
 assert.equal(x.machineExecutionAllowed,false);
 assert.equal(x.commercialActivationAllowed,false);
 assert.equal(x.capitalPermission,'0R');
});
test('legacy V195 credential usage can never be presented as first accepted tick',()=>{
 const legacy=fixture({version:'v195-gold-bridge-readiness-v1'});
 legacy.gates.bridge_authenticated={pass:true};
 legacy.gates.first_tick_received={
   pass:true,last_activity_at:fresh(),activity_age_seconds:1
 };
 const x=model(legacy,NOW);
 assert.equal(x.status,'LEGACY_CONTRACT_HOLD');
 assert.equal(x.stages[0].status,'done');
 assert.equal(x.stages[1].status,'unverified');
 assert.equal(x.stages[2].status,'unverified');
 assert.equal(x.lastObservedAt,null);
});
test('V326 without persisted-tick proof is also unsupported',()=>{
 const data=fixture();
 delete data.gates.first_tick_received.proof;
 const x=model(data,NOW);
 assert.equal(x.status,'LEGACY_CONTRACT_HOLD');
 assert.equal(x.proof,'NO_VERIFIABLE_TICK_CONTRACT');
});
test('the backend must independently hard-lock execution in its own contract',()=>{
 for(const governance of [
   {capital_permission:'1R'},
   {automatic_execution:true},
   {machine_execution_allowed:true},
   {live_order_submission_enabled:true}
 ]){
   const x=model(fixture({governance}),NOW);
   assert.equal(x.status,'LEGACY_CONTRACT_HOLD');
   assert.equal(x.action,'WAIT');
   assert.equal(x.capitalPermission,'0R');
 }
});
test('bridge absent requires owner MFA enrollment; no trade authorization',()=>{
 const x=model(fixture({state:'NO_BRIDGE_ENROLLED',
  gates:{
    bridge_enrolled:{pass:false},
    bridge_authenticated:{pass:false},
    first_tick_received:{pass:false,observed_at:null},
    quote_fresh:{pass:false},broker_live:{pass:false}
  }}),NOW);
 assert.equal(x.status,'BRIDGE_NOT_ENROLLED');
 assert.equal(x.stages[0].status,'waiting');
 assert.equal(x.commercialActivationAllowed,false);
});
test('enrolled read-only bridge with zero authenticated requests remains disconnected',()=>{
 const x=model(fixture({gates:{
  bridge_authenticated:{pass:false},
  first_tick_received:{pass:false,observed_at:null},
  quote_fresh:{pass:false},broker_live:{pass:false}
 }}),NOW);
 assert.equal(x.status,'RELAY_NOT_AUTHENTICATED');
 assert.equal(x.stages[0].status,'done');
 assert.equal(x.stages[1].status,'waiting');
 assert.equal(x.stages[2].status,'waiting');
 assert.match(x.next,/Windows MT5/);
});
test('credential authentication without persisted quote cannot be first tick',()=>{
 const x=model(fixture({gates:{
  first_tick_received:{pass:false,observed_at:null},
  quote_fresh:{pass:false},broker_live:{pass:false}
 }}),NOW);
 assert.equal(x.status,'WAITING_FIRST_TICK');
 assert.equal(x.stages[1].status,'done');
 assert.equal(x.stages[2].status,'waiting');
 assert.equal(x.lastObservedAt,null);
 assert.match(x.next,/clock/);
});
test('stale persisted tick still counts as first tick but never live',()=>{
 const x=model(fixture({gates:{
  first_tick_received:{observed_at:fresh(120_000)},
  quote_fresh:{pass:true},broker_live:{pass:true}
 }}),NOW);
 assert.equal(x.status,'TICK_NOT_FRESH');
 assert.equal(x.stages[2].status,'done');
 assert.equal(x.stages[3].status,'waiting');
 assert.equal(x.quoteAgeSeconds,120);
});
test('future skewed persisted quote cannot mark broker live',()=>{
 const x=model(fixture({gates:{
   first_tick_received:{observed_at:fresh(-10_000)}
 }}),NOW);
 assert.equal(x.status,'TICK_NOT_FRESH');
 assert.equal(x.stages[3].status,'waiting');
 assert.equal(x.lastObservedAt,null);
});
test('backend BROKER_LIVE state but independent quote quality deny does not pass',()=>{
 const x=model(fixture({gates:{quote_fresh:{pass:false}}}),NOW);
 assert.equal(x.status,'TICK_NOT_FRESH');
 assert.equal(x.machineExecutionAllowed,false);
});
test('upstream missing BROKER_LIVE confirmation prevents false positive',()=>{
 const x=model(fixture({state:'BROKER_STALE'}),NOW);
 assert.equal(x.status,'TICK_NOT_FRESH');
 assert.equal(x.stages[3].status,'waiting');
});
test('fully recent read-only feed is research-only without execution or licence',()=>{
 const x=model(fixture(),NOW);
 assert.equal(x.status,'READ_ONLY_FEED_OBSERVED');
 assert.equal(x.stages[3].status,'done');
 assert.equal(x.quoteAgeSeconds,1);
 assert.equal(x.providerLicenseVerified,false);
 assert.equal(x.brokerPriceVisible,false);
 assert.equal(x.accountIdentityVisible,false);
 assert.equal(x.commercialActivationAllowed,false);
 assert.equal(x.capitalPermission,'0R');
});
test('unrecognized data or malformed evidence fail closed',()=>{
 for(const d of [
  {ok:false},{ok:true,version:'v326-gold-bridge-first-tick-truth-review'},
  {ok:true,gates:{first_tick_received:{pass:true}}},
  {ok:null},{error:'backend down'}
 ]){
   const x=model(d,NOW);
   assert.notEqual(x.status,'READ_ONLY_FEED_OBSERVED');
   assert.equal(x.action,'WAIT');
   assert.equal(x.brokerPriceVisible,false);
 }
});
test('UI never fetches unsafe raw broker GET or uses bridge credentials',()=>{
 assert.match(ui,/public-gold-bridge-readiness-v195/);
 assert.doesNotMatch(ui,/\/functions\/v1\/broker-live-market-intake[^\s]*/);
 assert.doesNotMatch(ui,/X-TFA-Live-Bridge-Key|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(ui,/cache:'no-store'/);
 assert.match(ui,/\.textContent=/);
 assert.match(ui,/MAX_AGE_MS=5_000/);
});
test('Gold Workspace mounts console in Broker Data tab, preserving existing modules',()=>{
 assert.match(workspace,/import \{mountBrokerCommissioning\} from '\.\/gold-commissioning-v328\.mjs'/);
 assert.match(workspace,/mountBrokerCommissioning\(panels\.get\('broker'\)\)/);
 assert.match(workspace,/panels\.get\(category\)\.append\(section\)/);
});
test('UI has contrast, keyboard focus, mobile layout and reduced-motion support',()=>{
 for(const marker of [
   '.bc-refresh:focus-visible','.bc-runbook:focus-visible',
   '@media(max-width:590px)','@media(prefers-reduced-motion',
   '.bc-badge[data-state="observed"]'
 ])assert.ok(css.includes(marker),marker+' missing');
});
