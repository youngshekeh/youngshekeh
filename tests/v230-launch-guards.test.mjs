import assert from 'node:assert/strict';
import test from 'node:test';
import {positiveMarketPrice,normalizeReadOnlyGoldUpstream,evaluateV230LaunchProof} from '../src/v230-launch-guards.mjs';
import handler from '../api/gold-live-price.js';
const NOW=Date.parse('2026-10-22T08:00:00Z');
const GOLD={ok:true,live_broker:{state:'BROKER_LIVE',
  quote:{observed_at:new Date(NOW-1000).toISOString(),age_seconds:1,bid:4200,mid:4200.5,ask:4201}}};
function all(override={}){
 return {qa:{state:'PASS',total:107,passed:107,failed:0},
   gold:{http_ok:true,body:GOLD},
   paper:{mode:'PAPER_ONLY',broker_verified:true,real_money:false,verified_quotes:1,verified_receipts:1},
   billing:{webhook_verified:true,entitlement_verified:true,pricing_verified:true,manual_payment_confirmation:true},
   checkoutServerGuardDeployed:true,now:NOW,...override};
}
test('null/false/blank/zero and nonfinite are not market prices',()=>{
 for(const v of [null,undefined,false,true,'', '   ',0,'0',-1,Infinity,NaN,[],{}])
   assert.equal(positiveMarketPrice(v),null,String(v));
 assert.equal(positiveMarketPrice('4200.25'),4200.25);
});
test('upstream HTTP success must also carry explicit ok=true',()=>{
 for(const value of [null,{},[],{ok:false},{ok:'true'},{error:'no_quote'}]){
   const r=normalizeReadOnlyGoldUpstream(200,value);
   assert.equal(r.status,503);assert.equal(r.body.governance.capital_permission,'0R');
 }
 assert.equal(normalizeReadOnlyGoldUpstream(503,{ok:true}).status,503);
 assert.equal(normalizeReadOnlyGoldUpstream(200,{ok:true,state:'NO_BROKER'}).status,200);
});
test('verified Gold alone never unlocks checkout or live trading',()=>{
 const p=evaluateV230LaunchProof(all({checkoutServerGuardDeployed:false}));
 assert.equal(p.gates.gold_broker_read_only,true);
 assert.equal(p.ready,false);assert.ok(p.blockers.includes('commercial_checkout'));
 assert.equal(p.governance.live_order_submission_enabled,false);
});
test('missing paper quote or receipt blocks launch despite shadow intents',()=>{
 const p=evaluateV230LaunchProof(all({paper:{mode:'PAPER_ONLY',broker_verified:true,real_money:false,
   verified_quotes:0,verified_receipts:0,shadow_intents:43}}));
 assert.equal(p.gates.paper_broker_evidence,false);assert.equal(p.ready,false);
});
test('real money receipts are never acceptable as paper sandbox proof',()=>{
 const p=evaluateV230LaunchProof(all({paper:{mode:'PAPER_ONLY',broker_verified:true,
   real_money:true,verified_quotes:2,verified_receipts:2}}));
 assert.equal(p.gates.paper_broker_evidence,false);
});
test('30 failing QA tests block launch, never auto-pass',()=>{
 const p=evaluateV230LaunchProof(all({qa:{state:'FAIL',total:107,passed:77,failed:30}}));
 assert.equal(p.gates.autonomous_qa,false);assert.equal(p.ready,false);
});
test('aged, indicative, and spoofed broker quotes never qualify as live',()=>{
 const stale=structuredClone(GOLD);stale.live_broker.quote.observed_at=new Date(NOW-30_000).toISOString();
 assert.equal(evaluateV230LaunchProof(all({gold:{http_ok:true,body:stale}})).gates.gold_broker_read_only,false);
 const research=structuredClone(GOLD);research.live_broker.state='INDICATIVE_RESEARCH';
 assert.equal(evaluateV230LaunchProof(all({gold:{http_ok:true,body:research}})).gates.gold_broker_read_only,false);
 const spoof=structuredClone(GOLD);spoof.live_broker.quote.age_seconds='1';
 assert.equal(evaluateV230LaunchProof(all({gold:{http_ok:true,body:spoof}})).gates.gold_broker_read_only,false);
});
test('positive fixture only passes all four evidence gates for contract validation',()=>{
 const p=evaluateV230LaunchProof(all());
 assert.equal(p.ready,true);assert.equal(p.blockers.length,0);
 assert.equal(p.governance.capital_permission,'0R');
});
function responseMock(){const headers={};return {headers,setHeader(k,v){headers[k]=v;},
 status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
test('Gold proxy returns 503 for upstream JSON with ok=false, no false success',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({status:200,json:async()=>({ok:false,state:'UNAVAILABLE'})});
 try{const r=responseMock();await handler({method:'GET'},r);
   assert.equal(r.statusCode,503);assert.equal(r.body.governance.capital_permission,'0R');
   assert.equal(r.headers['X-TFA-Broker-Proof'],'NOT_VERIFIED');
 }finally{globalThis.fetch=original;}
});
test('Gold proxy returns honest HTTP 200 for status-only unavailable broker',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({status:200,json:async()=>({ok:true,live_broker:{state:'UNAVAILABLE'}})});
 try{const r=responseMock();await handler({method:'GET'},r);
   assert.equal(r.statusCode,200);assert.equal(r.headers['X-TFA-Broker-Proof'],'NOT_VERIFIED');
 }finally{globalThis.fetch=original;}
});
test('Gold proxy never performs trades and requires GET',async()=>{
 const r=responseMock();await handler({method:'POST'},r);
 assert.equal(r.statusCode,405);assert.equal(r.headers.Allow,'GET');
 assert.equal(r.body.governance.live_order_submission_enabled,false);
});
