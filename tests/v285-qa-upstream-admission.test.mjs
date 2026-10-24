import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preflightV285QaAdmission} from '../src/v285-qa-upstream-admission.mjs';
import {TRIAGE_URL} from '../src/v283-provider-edge-admission.mjs';

const when=Date.parse('2026-10-25T00:00:00Z');
function triage({incident=false,stale=false}={}){
  return {
    ok:true,version:'v258-readonly-recovery-triage-v1',
    generated_at:new Date(when-(stale?240000:1500)).toISOString(),
    state:incident?'DATABASE INCIDENT REPORTED':'PRIVATE CERTIFICATION NOT ESTABLISHED',
    checks:{database_incident_reported:incident,readiness_source_current:true,
      blockers:incident?['database_incident']:[],
      auth_http:{transport_reachable:true,state:'HTTP RESPONDED',http_status:200},
      postgrest_http:{transport_reachable:true,state:'HTTP ERROR',http_status:401}},
    governance:{action_permitted:'WAIT',capital_permission:'0R',
      live_order_submission_enabled:false,commercial_launch_certified:false},
    private_actions_executed:0,database_jobs_modified:0
  };
}
function fixture(body,{http=200,throwError=false}={}){
  const calls=[];
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    if(throwError)throw Error('unreachable');
    return {ok:http===200,status:http,json:async()=>body};
  };
  return{calls,fetcher};
}

test('current governed triage permits ONLY an attempt, never private certification',async()=>{
  const f=fixture(triage());
  const v=await preflightV285QaAdmission({fetcher:f.fetcher,now:()=>when});
  assert.equal(v.admitted,true);
  assert.equal(v.private_qa_certified,false);
  assert.equal(v.commercial_launch_certified,false);
  assert.equal(v.capital_permission,'0R');
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].url,TRIAGE_URL);
  assert.equal(f.calls[0].opts.method,'GET');
  assert.equal(f.calls[0].opts.credentials,'omit');
  assert.equal(f.calls[0].opts.redirect,'error');
  assert.equal(f.calls[0].opts.cache,'no-store');
  assert.equal(f.calls[0].opts.headers.Authorization,undefined);
});
test('active incident prevents private QA admission',async()=>{
  const f=fixture(triage({incident:true}));
  const v=await preflightV285QaAdmission({fetcher:f.fetcher,now:()=>when});
  assert.equal(v.admitted,false);
  assert.equal(v.reason,'DATABASE_INCIDENT_REPORTED');
  assert.equal(f.calls.length,1);
});
test('stale or contradictory triage fails closed',async()=>{
  for(const body of [triage({stale:true}),
    {...triage(),governance:{capital_permission:'1R'}},
    {...triage(),state:'COMMERCIAL_LAUNCH_READY'},
    {...triage(),checks:{database_incident_reported:false}}]){
    const f=fixture(body);
    assert.equal((await preflightV285QaAdmission({fetcher:f.fetcher,now:()=>when})).admitted,false);
    assert.equal(f.calls.length,1);
  }
});
test('transport failure, 503 or null payload fail closed without fallback calls',async()=>{
  for(const args of [{body:null,http:503},{body:null},{body:triage(),throwError:true}]){
    const f=fixture(args.body,args);
    const v=await preflightV285QaAdmission({fetcher:f.fetcher,now:()=>when});
    assert.equal(v.admitted,false);
    assert.equal(f.calls.length,1);
  }
});
test('V285 QA request checks preflight BEFORE obtaining OIDC or touching private runtime',()=>{
  const source=readFileSync(new URL('../api/autonomous-qa-matrix.js',import.meta.url),'utf8');
  const preflightAt=source.indexOf('await preflightV285QaAdmission()');
  const oidcAt=source.indexOf('await getVercelOidcToken()');
  assert.ok(preflightAt>0&&oidcAt>preflightAt);
  assert.match(source,/if\(!admission\.admitted\)/);
  assert.match(source,/qaRetryAt=Date\.now\(\)\+QA_NEGATIVE_COOLDOWN_MS/);
  const helper=readFileSync(new URL('../src/v285-qa-upstream-admission.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(helper,/service_role|cron\.alter_job|UPDATE public|INSERT INTO|DELETE FROM/);
  assert.match(readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8'),
    /CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
