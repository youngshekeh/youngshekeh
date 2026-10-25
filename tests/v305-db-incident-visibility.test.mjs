import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyPublicDatabaseIncident} from '../src/v305-db-incident-visibility.mjs';
const now=Date.parse('2026-10-25T13:05:00Z');
const wrap=(data,status=true)=>({response:{ok:status},data:{
 ok:true,generated_at:new Date(now-4000).toISOString(),
 database_incident:{active:true,code:'POSTGREST_RUNTIME_UNAVAILABLE'},...data
}});
test('V305 current reported DB incident explicitly blocks launch',()=>{
 const d=classifyPublicDatabaseIncident(wrap(),now);
 assert.equal(d.incident_reported,true);
 assert.equal(d.source_current,true);
 assert.match(d.state,/DATABASE INCIDENT REPORTED/);
 assert.match(d.detail,/Public reference availability does not prove SQL/);
 assert.equal(d.extra_private_requests,0);
 assert.equal(d.certified,false);
 assert.equal(d.commercial_launch_allowed,false);
 assert.equal(d.capital_permission,'0R');
 assert.equal(d.live_order_submission_enabled,false);
});
test('V305 no-incident is a report, never SQL health or paid certification',()=>{
 const d=classifyPublicDatabaseIncident(wrap({database_incident:{active:false}}),now);
 assert.equal(d.incident_reported,false);
 assert.equal(d.incident_clear_claimed,true);
 assert.match(d.state,/PRIVATE HEALTH NOT CERTIFIED/);
 assert.equal(d.certified,false);
 assert.equal(d.action_permitted,'WAIT');
});
test('V305 stale, missing, false, or invented readiness cannot clear database hold',()=>{
 const fixtures=[null,{},wrap({},false),
  wrap({generated_at:'2026-10-23T00:00:00Z',database_incident:{active:false}}),
  wrap({ok:false,database_incident:{active:false}}),
  wrap({database_incident:null}),
  wrap({database_incident:{active:'false'}}),
  wrap({generated_at:new Date(now+120000).toISOString(),database_incident:{active:false}})];
 for(const x of fixtures){
  const d=classifyPublicDatabaseIncident(x,now);
  assert.equal(d.source_current,false);
  assert.equal(d.incident_clear_claimed,false);
  assert.match(d.state,/HEALTH NOT VERIFIED/);
  assert.equal(d.capital_permission,'0R');
  assert.equal(d.commercial_launch_allowed,false);
 }
});
test('V305 status banner derives from existing readiness, never adds a private probe',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const status=read('src/status.ts'),html=read('status/index.html');
 assert.match(status,/classifyPublicDatabaseIncident\(readiness\)/);
 assert.match(status,/show\('database-incident',dbIncident.state,false\)/);
 assert.match(status,/show\('database-incident','DATABASE HEALTH NOT VERIFIED/);
 assert.match(html,/id="database-incident"/);
 assert.match(html,/id="database-incident-proof"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/supabase\.com\/dashboard\/support\/new/);
 assert.equal((status.match(/readEdge\('public-final-readiness'\)/g)||[]).length,1);
 assert.equal((status.match(/readSite\('\/api\/public-recovery-triage'\)/g)||[]).length,1);
 assert.match(status,/probeStatusDependencies\(/);
 assert.match(status,/evaluateLaunchReadiness\(\{ auth, readiness, billing, qa, gold \}\)/);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.match(read('src/v300-v79-semantic-http.mjs'),/engine_certified:false/);
});
