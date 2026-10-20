import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {buildEnquiry,validateEnquiry,clean,SERVICE_IDS,ENQUIRY_DESTINATION} from '../src/research-enquiry.mjs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sample=()=>({
 name:'Ada Obi',email:'ada@example.com',company:'Example Ltd',
 service:'africa-economy-intelligence',focus:'Nigeria consumer sector',
 goal:'Assess sector growth risks, competitors and macro conditions for expansion.',
 timeline:'Within 2-4 weeks',budget:'To be quoted',
 notes:'Evidence-based sources only.',consent:true
});
test('prepares research email without sending or storing user details',()=>{
 const e=buildEnquiry(sample());
 assert.equal(e.ok,true);
 assert.match(e.subject,/Research enquiry/);
 assert.match(e.body,/Nigeria & Africa Economy Intelligence/);
 assert.match(e.body,/ada@example.com/);
 assert.match(e.body,/Please confirm feasibility/);
 assert.ok(e.href.startsWith('mailto:'+ENQUIRY_DESTINATION+'?subject='));
 assert.ok(e.href.includes(encodeURIComponent('Ada Obi')));
 assert.doesNotMatch(file('src/research.ts'),/fetch\s*\(|localStorage|sessionStorage|XMLHttpRequest|sendBeacon/);
});
test('all five research service IDs support stable mapping',()=>{
 assert.equal(SERVICE_IDS.length,5);
 for(const service of SERVICE_IDS){
  const e=buildEnquiry({...sample(),service});
  assert.equal(e.ok,true,service);
 }
});
test('invalid input never produces a mailto link',()=>{
 for(const patch of [
  {name:''},{email:'bad-address'},{service:'malicious'},
  {goal:'too short'},{consent:false}
 ]){
  const r=buildEnquiry({...sample(),...patch});
  assert.equal(r.ok,false);
  assert.equal(r.href,undefined);
  assert.ok(r.errors.length>0);
 }
});
test('newline controls cannot inject extra mail headers',()=>{
 const v={...sample(),name:'Ada\r\nBcc: attacker@example.com',notes:'Line1\nLine2'};
 const r=buildEnquiry(v);
 assert.equal(r.ok,true);
 assert.doesNotMatch(r.body,/\r/);
 assert.doesNotMatch(r.body,/\nBcc:/);
 assert.match(r.body,/Line1 Line2/);
 assert.equal(clean('\u0000a\r\nb'),'a b');
});
test('length caps and URL encoding protect mailto composition',()=>{
 const r=buildEnquiry({...sample(),notes:'Z'.repeat(5000),goal:'A'.repeat(1200)});
 assert.equal(r.ok,true);
 assert.ok(r.body.includes('Z'.repeat(650)));
 assert.ok(!r.body.includes('Z'.repeat(651)));
 assert.ok(!r.body.includes('A'.repeat(501)));
 assert.match(r.href,/subject=/);
 assert.match(r.href,/&body=/);
});
test('public page is a Vite entry with no payment or backend dependencies',()=>{
 const config=file('vite.config.ts');
 const html=file('research/index.html');
 const controller=file('src/research.ts');
 assert.match(config,/research: resolve\(root, 'research\/index.html'\)/);
 assert.match(html,/id="research-form"/);
 assert.match(html,/id="research-copy"/);
 assert.match(html,/autocomplete="email"/);
 assert.match(controller,/new FormData\(form\)/);
 assert.match(controller,/event\.preventDefault\(\)/);
 assert.match(controller,/buildEnquiry\(collect\(\)\)/);
 assert.match(controller,/navigator\.clipboard\.writeText\(draft\)/);
 assert.match(controller,/if\(canOpen\)link\.href=enquiry\.href/);
 assert.doesNotMatch(controller,/\.submit\(\)|api\/checkout|create-checkout|payment-intent/);
 assert.match(html,/must send it/i);
});
test('commercial links and search metadata include research without indexing checkout',()=>{
 assert.match(file('pricing/index.html'),/href="\.\.\/research\/"/);
 assert.match(file('index.html'),/href="\.\/research\/"/);
 assert.match(file('sitemap.xml'),/https:\/\/thefatheranalytics\.com\/research/);
 assert.match(file('robots.txt'),/Disallow: \/checkout\//);
 assert.match(file('checkout/index.html'),/noindex,nofollow/);
});
