import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAnnex,DELIVERABLES,DATA_ACCESS,CONFIDENTIALITY,DELIVERY_FORMAT} from '../src/research-scope.mjs';
import {buildEnquiry,ENQUIRY_DESTINATION} from '../src/research-enquiry.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const good=()=>({
  name:'Test Client',email:'client@example.org',service:'custom-data-analysis',
  company:'Example Organization',focus:'Agriculture, West Africa',
  goal:'Assess market growth and the major drivers of operating costs.',
  timeline:'Flexible',budget:'To be quoted',notes:'Public sources only.',
  deliverables:['executive-decision-memo','sources-methodology-register','scenario-risk-matrix'],
  dataAccess:'public-sources-only',confidentiality:'nda-requested',
  deliveryFormat:'written-report',consent:true
});
test('productized scope is validated and adds explicitly requested deliverables',()=>{
 const scope=scopeAnnex(good());
 assert.equal(scope.ok,true);
 assert.equal(scope.lines.some(x=>x.includes('Executive decision memo')),true);
 assert.equal(scope.lines.some(x=>x.includes('Sources and methodology register')),true);
 assert.equal(scope.lines.some(x=>x.includes('Confidentiality agreement requested')),true);
 const e=buildEnquiry(good());
 assert.equal(e.ok,true);
 assert.match(e.body,/PROPOSED RESEARCH SCOPE/);
 assert.match(e.body,/Publicly available sources only/);
 assert.match(e.body,/Written report or decision memo/);
 assert.match(e.body,/not an accepted contract/i);
 assert.match(e.body,/not a subscription purchase/i);
 assert.equal(e.href.startsWith('mailto:'+ENQUIRY_DESTINATION),true);
});
test('historical V212 form without scoping fields remains valid and no choices are invented',()=>{
 const {deliverables,dataAccess,confidentiality,deliveryFormat,...basic}=good();
 const e=buildEnquiry(basic);
 assert.equal(e.ok,true);
 assert.match(e.body,/To be agreed during scoping/);
 assert.match(e.body,/Standard pre-contract enquiry/);
 assert.doesNotMatch(e.body,/Dashboard prototype/);
});
test('invalid and injected scope fields fail closed',()=>{
 for(const sample of [
 {deliverables:['executive-decision-memo','bogus-value']},
 {deliverables:['scenario-risk-matrix','scenario-risk-matrix']},
 {deliverables:Object.keys(DELIVERABLES).slice(0,5)},
 {deliverables:[42]},
 {dataAccess:'client-supplied-data\nBcc: attacker@example.test'},
 {confidentiality:'user-supplied-secret'},
 {deliveryFormat:'../../etc/passwd'}
 ]){
  const r=buildEnquiry({...good(),...sample});
  assert.equal(r.ok,false,JSON.stringify(sample));
  assert.equal(r.href,undefined);
  assert.ok(r.errors.length);
 }
});
test('all supported choices map to bounded static public descriptions',()=>{
 assert.equal(Object.keys(DELIVERABLES).length,7);
 assert.equal(Object.keys(DATA_ACCESS).length,4);
 assert.equal(Object.keys(CONFIDENTIALITY).length,2);
 assert.equal(Object.keys(DELIVERY_FORMAT).length,5);
 for(const id of Object.keys(DELIVERABLES)){
  assert.equal(scopeAnnex({...good(),deliverables:[id]}).ok,true);
 }
 for(const key of Object.keys(DATA_ACCESS)){
  assert.equal(scopeAnnex({...good(),dataAccess:key}).ok,true);
 }
});
test('form includes every exact serverless scope choice and downloadable file control',()=>{
 const html=read('research/index.html');
 const app=read('src/research.ts');
 for(const id of Object.keys(DELIVERABLES)){
  assert.ok(html.includes('value="'+id+'"'),id);
 }
 for(const id of Object.keys(DATA_ACCESS)){
  assert.ok(html.includes('value="'+id+'"'),id);
 }
 assert.match(html,/name="dataAccess"/);
 assert.match(html,/name="confidentiality"/);
 assert.match(html,/name="deliveryFormat"/);
 assert.match(html,/id="research-download"/);
 assert.match(html,/prepared|prepare/i);
 assert.match(html,/No payment|no payment/i);
 assert.match(app,/data\.getAll\('deliverables'\)/);
 assert.match(app,/navigator\.clipboard\.writeText\(draft\)/);
 assert.match(app,/new Blob\(\[draft\],\{type:'text\/plain;charset=utf-8'\}\)/);
 assert.match(app,/URL\.createObjectURL\(blob\)/);
 assert.match(app,/anchor\.download='the-father-research-enquiry\.txt'/);
 assert.match(app,/URL\.revokeObjectURL\(objectUrl\)/);
});
test('no network transmission, persistent storage, payment or trade access in scope flow',()=>{
 const app=read('src/research.ts');
 const business=read('src/research-enquiry.mjs');
 const scope=read('src/research-scope.mjs');
 const combined=app+business+scope;
 assert.doesNotMatch(combined,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB/);
 assert.doesNotMatch(combined,/\bcheckout\b|payment-intent|executeTrade|placeOrder|tradeOrder/i);
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('api/ops-heartbeat.js'),/certifyKernelReceipt/);
});
test('responsive scope CSS and existing research route remain present',()=>{
 const css=read('src/research.css');
 assert.match(css,/\.scope-options\{display:grid/);
 assert.match(css,/@media\(max-width:610px\)/);
 assert.match(read('vite.config.ts'),/research: resolve\(root, 'research\/index.html'\)/);
});
