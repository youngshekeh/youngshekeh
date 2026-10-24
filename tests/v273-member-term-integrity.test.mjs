import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('supabase/functions/member-session/index.ts');
const checkout=read('src/checkout.ts');
const match=src.match(/function paidTermValid\(sub,now=Date\.now\(\)\)\{[\s\S]*?\n\}/);
if(!match)throw new Error('V273 production paid-term helper missing');
const check=vm.runInNewContext(match[0]+';paidTermValid',{});
const NOW=Date.parse('2026-10-24T07:40:00Z');
test('missing, undefined, invalid, expired term NEVER grants a paid subscription',()=>{
 for(const x of [null,{}, {current_period_end:null},
  {current_period_end:''},{current_period_end:' '},
  {current_period_end:'not-a-date'},
  {current_period_end:new Date(NOW-1000).toISOString()},
  {current_period_end:new Date(NOW).toISOString()}])
   assert.equal(check(x,NOW),false,JSON.stringify(x));
});
test('future paid term is valid; no new charge or term extension is invented',()=>{
 assert.equal(check({current_period_end:new Date(NOW+60_000).toISOString()},NOW),true);
 assert.equal(check({current_period_end:'2026-11-24T00:00:00+00:00'},NOW),true);
 assert.equal(check({current_period_end:'2026-11-24T01:00:00+01:00'},NOW),true);
 assert.equal(check({current_period_end:1234567890},NOW),false);
});
test('server computes paid entitlement before claims and cannot use null as forever valid',()=>{
 assert.match(src,/const periodOk=planId==='free'\|\|paidTermValid\(sub\)/);
 assert.match(src,/const active=statusEligible&&periodOk/);
 assert.match(src,/active\?feats\(planId,plans\):feats\('free',plans\)/);
 assert.match(src,/access_state:owner\?'owner':active\?'granted':'limited'/);
 assert.match(src,/effective_tier:owner\?'owner':\(active\?planId:'free'\)/);
 assert.match(src,/access_label:owner\?'Owner':\(active\?\(plan\?\.name\?\?'Free'\):'Free'\)/);
 assert.doesNotMatch(src,/!sub\?\.current_period_end\|\|new Date\(sub.current_period_end\)/);
 assert.match(src,/member-session-v12-strict-paid-term/);
});
test('verified owner access remains independent of non-owner paid subscription status',()=>{
 assert.match(src,/const owner=owners\?\.\[0\]\?\?null/);
 assert.match(src,/const ent=owner\?feats\('enterprise',plans\)/);
 assert.match(src,/is_owner:!!owner/);
 assert.match(src,/owner_role:owner\?\.role\?\?null/);
});
test('current member token required and limited accounts cannot pass checkout validation',()=>{
 assert.match(src,/fetch\(\x60\$\{base\}\/auth\/v1\/user\x60/);
 assert.match(src,/if\(!ur\.ok\)return Response\.json\(\{ok:false,error:'invalid_session'/);
 assert.match(src,/verify_jwt/i); // set in Supabase metadata at rollout: ensure in operations doc
 assert.match(checkout,/data\?\.access_state==='granted'&&data\?\.subscription\?\.period_valid===true/);
 assert.match(checkout,/data\?\.is_owner===true&&data\?\.access_state==='owner'/);
 assert.doesNotMatch(checkout,/access_state!=='denied'/);
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
});
test('handler never writes membership rows and existing webhook is not changed',()=>{
 assert.doesNotMatch(src,/method:'PATCH'|method:'POST'|ALTER TABLE|update subscriptions|activate_subscription_from_payment|send_email|create-checkout/);
 assert.match(src,/rows\(base,k,'subscriptions'/);
 assert.match(src,/Cache-Control':'no-store'/);
});
test('operator evidence is aggregate, fail-closed and does not claim paid accounts',()=>{
 const doc=read('docs/operations/2026-10-24-v273-member-term-integrity.md');
 assert.match(doc,/four.*missing.*period/i);
 assert.match(doc,/No payment data was modified/);
 assert.match(doc,/not proof of four paid customers/i);
});
