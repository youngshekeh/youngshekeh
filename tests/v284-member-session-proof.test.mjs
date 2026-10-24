import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessMemberSession} from '../src/member-session-proof.mjs';
const at=Date.parse('2026-10-24T23:00:00Z'),user={id:'00000000-0000-0000-0000-000000000012'};
const term=new Date(at+30*86400000).toISOString();
const base={ok:true,version:'member-session-v12-strict-paid-term',
 user,is_owner:false,access_state:'granted',
 subscription:{plan_id:'pro',plan_name:'Pro',status:'active',
  period_valid:true,current_period_end:term}};
test('valid provider-verified paid period allows the display of paid membership',()=>{
 const o=assessMemberSession(base,at);
 assert.equal(o.authenticated,true);
 assert.equal(o.paid_or_owner,true);
 assert.equal(o.access_state,'granted');
 assert.match(o.label,/PAID/);
});
test('HTTP 200 without a valid member-session semantic payload cannot grant access',()=>{
 for(const v of [null,{}, {...base,ok:false},
  {...base,version:'untrusted-v1'},{...base,user:{id:'unverified'}},
  {...base,access_state:'owner',is_owner:false},
  {...base,access_state:'granted',subscription:{...base.subscription,period_valid:false}},
  {...base,subscription:{...base.subscription,current_period_end:null}},
  {...base,subscription:{...base.subscription,current_period_end:new Date(at-1).toISOString()}},
  {...base,subscription:{...base.subscription,plan_id:'free'}},
  {...base,subscription:{...base.subscription,status:'past_due'}}]){
  assert.equal(assessMemberSession(v,at).authenticated,false,JSON.stringify(v).slice(0,90));
 }
});
test('free or expired accounts show limited state, never paid',()=>{
 const o=assessMemberSession({...base,access_state:'limited',
  subscription:{plan_id:'free',plan_name:'Free',status:'inactive',
   period_valid:true,current_period_end:null}},at);
 assert.equal(o.authenticated,true);assert.equal(o.paid_or_owner,false);
 assert.equal(o.label,'LIMITED / FREE');
 assert.match(o.description,/No paid research entitlement verified/);
});
test('owner identity is separate from required MFA/AAL2',()=>{
 const o=assessMemberSession({...base,is_owner:true,access_state:'owner'},at);
 assert.equal(o.authenticated,true);assert.equal(o.is_owner,true);
 assert.match(o.description,/MFA\/AAL2 is still required/);
});
test('member browser persists token only AFTER verified session and cleans up failure',()=>{
 const text=readFileSync(new URL('../src/member.ts',import.meta.url),'utf8');
 const verify=text.indexOf('const verdict = await verifySession(data.access_token);');
 const save=text.indexOf('saveSession(data);');
 assert.ok(verify>0&&save>verify);
 assert.match(text,/if \(!verdict\.authenticated\) throw new Error/);
 assert.match(text,/if \(!response\.ok\) throw new Error\('member_session_unverified'\)/);
 assert.match(text,/SIGN[ED I]+IN · LIMITED ACCESS|SIGNED IN · LIMITED ACCESS/);
 assert.match(text,/catch \(error\) \{\s+clearSession\(\);/);
 assert.match(text,/signal:AbortSignal\.timeout\(8000\)/);
 assert.doesNotMatch(text,/innerHTML|Authorization: `Bearer $\{data\.refresh_token\}/);
 assert.match(readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
