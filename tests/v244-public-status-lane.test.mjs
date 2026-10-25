import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {probePublicStatus} from '../src/status-public-lane.mjs';
import {curateGoldReference,curateBitcoinReference,curatePublicReferences} from '../src/public-market-reference-data.mjs';
const now=Date.parse('2026-10-22T14:25:00.000Z');
function current(){
 const gold=curateGoldReference({symbol:'XAU',currency:'USD',price:4120,updatedAt:'2026-10-22T14:24:47.000Z'},now);
 const bitcoin=curateBitcoinReference({data:{base:'BTC',currency:'USD',amount:'82000'}},now);
 return {response:{ok:true},data:curatePublicReferences({gold,bitcoin},now)};
}
test('public lane verifies licensed Gold reference while BTC display remains held',async()=>{
 let report;
 const result=await probePublicStatus({readReference:async()=>current(),now:()=>now,report:v=>{report=v}});
 assert.equal(result.reference_state,'ONE CURRENT SOURCE');
 assert.equal(result.verified_references,1);
 assert.deepEqual(report,result);
 assert.equal(result.commercial_checkout_certified,false);
 assert.equal(result.private_kernel_certified,false);
 assert.equal(result.capital_permission,'0R');
});
test('a failed public source does not mark the site itself down',async()=>{
 const result=await probePublicStatus({readReference:()=>Promise.reject(Error('provider_timeout')),now:()=>now});
 assert.equal(result.page_delivered,true);
 assert.equal(result.reference_state,'NO CURRENT SOURCES');
 assert.equal(result.execution_quote_verified,false);
});
test('tampered stale references never become current',async()=>{
 const input=current();
 input.data={...input.data,assets:{
  gold:{...input.data.assets.gold,source_updated_at:'2026-10-22T12:00:00.000Z'},
  bitcoin:{...input.data.assets.bitcoin,observed_at:'2026-10-22T12:00:00.000Z'}
 }};
 const result=await probePublicStatus({readReference:async()=>input,now:()=>now});
 assert.equal(result.verified_references,0);
 assert.equal(result.page_state,'PAGE DELIVERED');
});
test('status route starts an isolated public read and does not couple it to private Promise.allSettled',()=>{
 const content=readFileSync(new URL('../src/status.ts',import.meta.url),'utf8');
 const privateBlock=content.match(/const results = await Promise\.allSettled\(\[([\s\S]*?)\]\)/)?.[1];
 assert.ok(privateBlock);
 assert.doesNotMatch(privateBlock,/public-market-reference/);
 assert.match(content,/void loadPublic\(\);\s*void load\(\)/);
 assert.match(content,/readReference:\(\)=>readSite\('\/api\/public-market-reference'\)/);
});
test('new homepage stylesheet is landing-page scoped and does not recolor other routes',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../src/home-editorial.css',import.meta.url),'utf8');
 const module=readFileSync(new URL('../src/public-market-reference.mjs',import.meta.url),'utf8');
 assert.match(html,/<body class="home-public">/);
 assert.match(module,/home-editorial\.css/);
 const rules=css.match(/(^|\n)\s*([^{\n]+)\{/g)||[];
 assert.ok(rules.length>20);
 assert.ok(css.includes('body.home-public .topbar'));
 assert.ok(css.includes('body.home-public .global-hero'));
});
