import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 QA_TRIAGE_COLDEST_SOURCE_MS, QA_PREFLIGHT_TIMEOUT_MS,
 QA_PRIVATE_UPSTREAM_TIMEOUT_MS, QA_PGNET_TIMEOUT_MS,
 QA_VERCEL_MAX_DURATION_SECONDS, verifyQaDeadlineEnvelope
} from '../src/v296-qa-deadline-envelope.mjs';
import {preflightV285QaAdmission} from '../src/v285-qa-upstream-admission.mjs';

const file=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function healthy(now){
 return {ok:true,version:'v258-readonly-recovery-triage-v1',
  generated_at:new Date(now-1000).toISOString(),
  state:'PRIVATE CERTIFICATION NOT ESTABLISHED',
  checks:{database_incident_reported:false,readiness_source_current:true,
   auth_http:{transport_reachable:true,state:'HTTP RESPONDED',http_status:200},
   postgrest_http:{transport_reachable:true,state:'HTTP ERROR',http_status:401}},
  governance:{action_permitted:'WAIT',capital_permission:'0R',
   live_order_submission_enabled:false,commercial_launch_certified:false},
  private_actions_executed:0,database_jobs_modified:0};
}
test('V296 cold triage, QA upstream, pg_net and Vercel fit one bounded envelope',()=>{
 assert.equal(QA_TRIAGE_COLDEST_SOURCE_MS,9000);
 assert.equal(QA_PREFLIGHT_TIMEOUT_MS,10500);
 assert.equal(QA_PRIVATE_UPSTREAM_TIMEOUT_MS,30000);
 assert.equal(QA_PGNET_TIMEOUT_MS,45000);
 assert.equal(QA_VERCEL_MAX_DURATION_SECONDS,50);
 const x=verifyQaDeadlineEnvelope();
 assert.equal(x.valid,true);
 assert.equal(x.parallel_retries_added,0);
 assert.equal(x.capital_permission,'0R');
 assert.equal(x.private_qa_certified,false);
 assert.equal(x.commercial_launch_certified,false);
 assert.equal(verifyQaDeadlineEnvelope({preflight:3500}).valid,false);
 assert.equal(verifyQaDeadlineEnvelope({pgnet:20000}).valid,false);
 assert.equal(verifyQaDeadlineEnvelope({vercel:40000}).valid,false);
 assert.equal(verifyQaDeadlineEnvelope({upstream:39000}).valid,false);
});
test('V296 health preflight remains read-only, source-bound, credential-free and fail-closed',async()=>{
 const when=Date.parse('2026-10-25T08:30:00Z');
 let requests=0,signal;
 const fetcher=async(url,opts)=>{
  requests++;signal=opts.signal;
  assert.equal(url,'https://thefatheranalytics.com/api/public-recovery-triage');
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.Authorization,undefined);
  return {ok:true,status:200,json:async()=>healthy(when)};
 };
 const x=await preflightV285QaAdmission({fetcher,now:()=>when});
 assert.equal(x.admitted,true);
 assert.equal(x.private_qa_certified,false);
 assert.equal(x.commercial_launch_certified,false);
 assert.equal(x.capital_permission,'0R');
 assert.equal(requests,1);
 assert.ok(signal instanceof AbortSignal);
 for(const altered of [
  {...healthy(when),checks:{database_incident_reported:true}},
  {...healthy(when),governance:{capital_permission:'1R'}},
  {...healthy(when),generated_at:'2020-01-01T00:00:00Z'}
 ]){
  const denied=await preflightV285QaAdmission({fetcher:async()=>({ok:true,status:200,json:async()=>altered}),now:()=>when});
  assert.equal(denied.admitted,false);
 }
 const missing=await preflightV285QaAdmission({fetcher:async()=>{throw Error('network blocked')},now:()=>when});
 assert.equal(missing.reason,'PREFLIGHT_TRANSPORT_UNAVAILABLE');
 assert.equal(missing.admitted,false);
});
test('V296 reviewed enqueue SQL differs only by request timeout, not grants, URL or schedule',()=>{
 const current=file('supabase/recovery/v296_private_qa_deadline.sql').slice(
  file('supabase/recovery/v296_private_qa_deadline.sql').indexOf('CREATE OR REPLACE FUNCTION'));
 const old=file('supabase/recovery/v296_private_qa_deadline_rollback.sql').slice(
  file('supabase/recovery/v296_private_qa_deadline_rollback.sql').indexOf('CREATE OR REPLACE FUNCTION'));
 const normalize=x=>x.trim().replace(/;\s*$/,'').trim();
 assert.equal(normalize(current),normalize(old).replace('timeout_milliseconds := 20000','timeout_milliseconds := 45000'));
 assert.equal((current.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.equal((current.match(/\$function\$/g)||[]).length,2);
 assert.equal((current.match(/net\.http_get\(/g)||[]).length,1);
 assert.match(current,/SECURITY DEFINER/);
 assert.match(current,/SET search_path TO 'public', 'extensions', 'net', 'pg_temp'/);
 assert.match(current,/timeout_milliseconds := 45000/);
 assert.match(current,/on conflict\(request_id\) do nothing/);
 assert.doesNotMatch(current,/\b(GRANT|REVOKE|DROP|ALTER ROLE)\b|cron\.schedule\b/i);
});
test('V296 Vercel function deadline contains upstream without relaxing traffic policy',()=>{
 const conf=JSON.parse(file('vercel.json'));
 assert.equal(conf.functions['api/autonomous-qa-matrix.js'].maxDuration,50);
 assert.match(conf.ignoreCommand,/\[deploy\]/);
 const endpoint=file('api/autonomous-qa-matrix.js');
 const preflightAt=endpoint.indexOf('await preflightV285QaAdmission()');
 const oidcAt=endpoint.indexOf('await getVercelOidcToken()');
 assert.ok(preflightAt>=0&&oidcAt>preflightAt);
 assert.ok(endpoint.includes('signal:AbortSignal.timeout(30000)'));
 assert.match(endpoint,/QA_NEGATIVE_COOLDOWN_MS=60_000/);
 assert.match(endpoint,/if\(qaBusy\)return denied/);
 assert.match(endpoint,/if\(!admission\.admitted\)/);
 assert.doesNotMatch(endpoint,/getVercelOidcToken\(\).*\|\|.*SUPABASE/i);
 assert.match(file('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(file('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
});
