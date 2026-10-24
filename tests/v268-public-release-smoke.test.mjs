import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessV268PublicRelease,V268_ENDPOINTS,V268_ORIGIN} from '../src/v268-public-release-smoke.mjs';
const now=Date.parse('2026-10-24T06:00:00Z'),at=ms=>new Date(ms).toISOString();
const sha='a'.repeat(40),g={action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false};
const packet=(body)=>({status:200,body:{ok:true,...body}});
const good=()=>({
 release:packet({state:'PRODUCTION_SOURCE_VERIFIED',environment:'production',
  git_branch:'the-father-analytics-deploy',expected_production_branch:'the-father-analytics-deploy',
  git_commit_sha:sha,governance:{metadata_only:true,release_metadata_can_grant_capital:false,
   automatic_execution:false,capital_permission:'0R'}}),
 page:{status:200,body:null},
 markets:packet({generated_at:at(now-12000),market_status:'MARKET_CLOSED',
  decision:{action:'WAIT',capital_permission:'0R'},assets:[
  {key:'gold',price:4000,market_time:at(now-8*3600000),state:'MARKET_CLOSED',
   action:'WAIT',capital_permission:'0R'},
  {key:'bitcoin',price:80000,market_time:at(now-15000)}]}),
 reference:packet({reference_only:true,not_for_trade_execution:true,governance:{...g}}),
 quarterly:packet({reference_only:true,not_for_trade_execution:true,
  assets:{gold:{source_rights:'COMMERCIAL_REDISTRIBUTION_NOT_VERIFIED',
   is_actual_orderbook_liquidity:false,governance:{...g}}}}),
 recovery:packet({state:'DATABASE INCIDENT REPORTED',private_actions_executed:0,
  database_jobs_modified:0,governance:{...g,commercial_launch_certified:false},
  checks:{readiness_source_current:true,database_incident_reported:true}})
});
const assess=x=>assessV268PublicRelease(x,{expectedSha:sha,now});
test('public research requires exact deployed commit, fresh BTC and 0R even on closed weekends',()=>{
 const x=assess(good());
 assert.deepEqual(x.blockers,[]);
 assert.equal(x.state,'PUBLIC_RESEARCH_ACCEPTED_COMMERCIAL_UNVERIFIED');
 assert.equal(x.public_research_pass,true);
 assert.equal(x.checks.database_incident_reported,true);
 assert.equal(x.commercial_launch_certified,false);
 assert.equal(x.private_kernel_certified,false);
 assert.equal(x.broker_quote_certified,false);
 assert.equal(x.trading,'WAIT / 0R');
 assert.equal(x.verified_sha,sha);
});
test('wrong, absent or unverified deployment provenance fails release admission',()=>{
 for(const bad of ['', 'wrong', 'b'.repeat(40)]){
  const x=assessV268PublicRelease(good(),{expectedSha:bad,now});
  assert.equal(x.public_research_pass,false);
 }
 for(const patch of [
  {git_commit_sha:'b'.repeat(40)}, {environment:'preview'},
  {git_branch:'preview'}, {state:'PRODUCTION_SOURCE_UNVERIFIED'},
  {governance:{metadata_only:true,release_metadata_can_grant_capital:true,
    automatic_execution:false,capital_permission:'0R'}}
 ]){
  const p=good();p.release.body={...p.release.body,...patch};
  assert.equal(assess(p).checks.production_commit,false);
 }
});
test('stale/missing Bitcoin receipt or invalid closed Gold state never passes',()=>{
 for(const patch of [
  {market_time:at(now-11*60_000)}, {price:0},
  {market_time:'invalid'}]){
  const p=good();p.markets.body.assets[1]={...p.markets.body.assets[1],...patch};
  assert.equal(assess(p).public_research_pass,false);
 }
 for(const patch of [{capital_permission:'1R'},{state:'MARKET_OPEN'},
  {action:'BUY'}]){
  const p=good();p.markets.body.assets[0]={...p.markets.body.assets[0],...patch};
  assert.equal(assess(p).public_research_pass,false);
 }
 const stale=good();stale.markets.body.generated_at=at(now-16*60_000);
 assert.equal(assess(stale).public_research_pass,false);
});
test('market feed and public status outages are real admission failures',()=>{
 for(const key of ['page','markets']){
  const p=good();p[key].status=503;
  assert.equal(assess(p).public_research_pass,false,key);
 }
 const p=good();p.markets.body.decision.capital_permission='1R';
 assert.ok(assess(p).blockers.includes('PUBLIC_MARKET_FRESHNESS_OR_GOVERNANCE_NOT_VERIFIED'));
 const unsafe=good();unsafe.markets.body.decision.action='BUY';
 assert.equal(assess(unsafe).public_research_pass,false);
});
test('optional upstream outages stay unverified, never magically certified or private-ready',()=>{
 const p=good();p.reference={status:503,body:null};
 p.quarterly={status:503,body:null};p.recovery={status:503,body:null};
 const a=assess(p);
 assert.equal(a.public_research_pass,true);
 assert.equal(a.checks.independent_reference,false);
 assert.equal(a.checks.quarterly_research,false);
 assert.equal(a.checks.recovery_read_only,false);
 assert.equal(a.commercial_launch_certified,false);
 assert.equal(a.private_kernel_certified,false);
});
test('partially available quarterly research remains distinct from a falsely licensed claim',()=>{
 const p=good();p.quarterly.body.assets.bitcoin=null;
 assert.equal(assess(p).public_research_pass,true);
 assert.equal(assess(p).checks.quarterly_research,true);
});
test('positive unsafe independent sources cannot be dismissed as transient outages',()=>{
 for(const key of ['reference','quarterly','recovery']){
  const p=good();
  if(key==='reference')p.reference.body.governance.capital_permission='1R';
  if(key==='quarterly')p.quarterly.body.assets.gold.is_actual_orderbook_liquidity=true;
  if(key==='recovery')p.recovery.body.private_actions_executed=1;
  assert.equal(assess(p).public_research_pass,false,key);
 }
});
test('fixed origin/paths and CLI never access private DB, secrets, paid checkout or trades',()=>{
 assert.equal(V268_ORIGIN,'https://thefatheranalytics.com');
 assert.deepEqual(Object.keys(V268_ENDPOINTS),
  ['release','page','markets','reference','quarterly','recovery']);
 const src=readFileSync(new URL('../scripts/v268-public-release-smoke.mjs',import.meta.url),'utf8');
 const core=readFileSync(new URL('../src/v268-public-release-smoke.mjs',import.meta.url),'utf8');
 const combined=src+core;
 assert.match(src,/TFA_EXPECTED_SHA/);
 assert.match(src,/process.exitCode=1/);
 assert.doesNotMatch(combined,/SUPABASE_SERVICE_ROLE|SUPABASE_DB_URL|DATABASE_URL|CRON_SECRET|POST \/|execute_trade|place_order|create_checkout|automatic_checkout_unlock/i);
 assert.doesNotMatch(src,/headers:\s*\{[^}]*Authorization/i);
});
