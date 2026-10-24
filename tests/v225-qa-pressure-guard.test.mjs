import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
const raw=readFileSync(new URL('../api/autonomous-qa-matrix.js',import.meta.url),'utf8');
const source=raw.replace(/^import .*;\s*$/gm,'')
  .replace('export default async function handler','async function handler');
function fixture({body={ok:false,state:'INCOMPLETE'}, token='verified-oidc', status=200, hold=false}={}){
 let time=0, calls=0, tokens=0, release;
 const Clock=class extends Date { static now(){return time;} };
 const fetch=async()=>{
   calls++;
   if(hold)await new Promise(resolve=>{release=resolve});
   return {ok:status>=200&&status<300,status,json:async()=>body};
 };
 const getVercelOidcToken=async()=>{tokens++;return token};
 const handler=new Function('fetch','getVercelOidcToken','preflightV285QaAdmission','Date','URL','AbortSignal',
   source+'\nreturn handler;')(fetch,getVercelOidcToken,async()=>({admitted:true}),Clock,URL,AbortSignal);
 const run=async(url='/api/autonomous-qa-matrix?ui_bucket=123',method='GET')=>{
   const headers=new Map();let code=200;
   const res={setHeader:(k,v)=>headers.set(k.toLowerCase(),v),
     status(n){code=n;return this;},json:payload=>({code,payload,headers})};
   return handler({url,method},res);
 };
 return {run,advance:ms=>{time+=ms},calls:()=>calls,tokens:()=>tokens,release:()=>release?.()};
}
test('first incomplete private QA triggers a bounded fail-closed instance cooldown',async()=>{
 const f=fixture();
 const a=await f.run();assert.equal(a.code,200);assert.equal(a.payload.ok,false);
 const b=await f.run('/api/autonomous-qa-matrix?ui_bucket=456');
 assert.equal(b.code,503);assert.equal(b.headers.get('cache-control'),'no-store');
 assert.equal(b.payload.state,'INCOMPLETE');
 assert.equal(b.headers.get('x-tfa-qa-pressure'),'NEGATIVE_COOLDOWN');
 assert.equal(f.calls(),1);assert.equal(f.tokens(),1);
 f.advance(59999);assert.equal((await f.run()).code,503);assert.equal(f.calls(),1);
 f.advance(1);assert.equal((await f.run()).code,200);assert.equal(f.calls(),2);
});
test('a running private QA does not admit overlapping requests or expose its response',async()=>{
 const f=fixture({hold:true,body:{ok:true,state:'PASS'}});
 const first=f.run();
 for(let i=0;i<9;i++)await Promise.resolve();
 const second=await f.run('/api/autonomous-qa-matrix?commercial_acceptance=1');
 assert.equal(second.code,503);
 assert.equal(second.payload.error,'private_qa_temporarily_unavailable');
 assert.equal(second.headers.get('x-tfa-qa-pressure'),'IN_PROGRESS');
 f.release();assert.equal((await first).code,200);assert.equal(f.calls(),1);
 const third=f.run();for(let i=0;i<9;i++)await Promise.resolve();
 f.release();assert.equal((await third).code,200);assert.equal(f.calls(),2);
});
test('healthy QA stays current and is never served from negative cache',async()=>{
 const f=fixture({body:{ok:true,state:'PASS'}});
 assert.equal((await f.run()).code,200);
 assert.equal((await f.run()).code,200);
 assert.equal(f.calls(),2);
});
test('failure of OIDC token and upstream transport stays unverified',async()=>{
 const noIdentity=fixture({token:''});
 assert.equal((await noIdentity.run()).code,503);
 assert.equal((await noIdentity.run()).code,503);
 assert.equal(noIdentity.calls(),0);
 const unavailable=fixture({body:{ok:false},status:503});
 assert.equal((await unavailable.run()).code,503);
 assert.equal((await unavailable.run()).code,503);
 assert.equal(unavailable.calls(),1);
});
test('GET-only access, existing OIDC guard and prior pressure-cache policy are unchanged',async()=>{
 const f=fixture({body:{ok:false,transport:{pressure_circuit:{open:true}}}});
 assert.equal((await f.run(undefined,'POST')).code,405);
 const response=await f.run();
 assert.equal(response.headers.get('x-tfa-pressure-cache'),'ACTIVE_5M');
 assert.equal(response.headers.get('cdn-cache-control'),'public, max-age=300');
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(raw,/getVercelOidcToken\(\)/);
 assert.match(raw,/signal:AbortSignal\.timeout\(30000\)/);
 assert.doesNotMatch(raw,/cron\.alter_job|cron\.unschedule|ALTER ROLE|live_order_submission_enabled:true/i);
});
