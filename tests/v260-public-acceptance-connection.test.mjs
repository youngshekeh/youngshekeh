import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPublicAcceptanceReader} from '../src/public-acceptance-connection.mjs';
const paths=['public-final-readiness','public-auth-runtime-check','public-billing-acceptance'];
test('public acceptance requests satisfy the deployed content-type-only CORS policy',async()=>{
 const visits=[];
 const source={ok:true,generated_at:'2026-10-23T22:03:18Z',state:'BUILD_HOLD'};
 const read=createPublicAcceptanceReader({fetchImpl:async(url,options)=>{
  visits.push({url,options});return Response.json(source);
 }});
 for(const path of paths){
  const result=await read(path);
  assert.deepEqual(result.data,source,'preserve source timestamp and hold');
 }
 assert.equal(visits.length,3);
 for(const {url,options:o} of visits){
  assert.ok(paths.includes(url.split('/').at(-1)));
  assert.equal(new URL(url).origin,'https://mpcelmjiycjpdyyflisn.supabase.co');
  assert.equal(o.method,'GET');assert.deepEqual(o.headers,{Accept:'application/json'});
  assert.equal(o.credentials,'omit');assert.equal(o.mode,'cors');
  assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  assert.ok(o.signal instanceof AbortSignal);
 }
});
test('private, credentialed, query and arbitrary-host targets cannot enter this reader',async()=>{
 let calls=0;
 const read=createPublicAcceptanceReader({fetchImpl:async()=>{calls++;return Response.json({ok:true})}});
 for(const path of ['member-session','create-checkout','runtime-v180-continuous-kernel',
  '../public-final-readiness','public-final-readiness?key=secret',
  'https://example.com/public-final-readiness','',null])
  await assert.rejects(()=>read(path),/unknown_public_acceptance_route/);
 assert.equal(calls,0);
});
test('overlapping public requests coalesce; the next completed request gets new source evidence',async()=>{
 let calls=0,release;
 const wait=new Promise(resolve=>{release=resolve});
 const read=createPublicAcceptanceReader({fetchImpl:async()=>{
  calls++;if(calls===1)await wait;return Response.json({ok:true,sequence:calls});
 }});
 const first=read(paths[0]),second=read(paths[0]);
 assert.equal(calls,1);release();
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a.data.sequence,1);assert.equal(b.data.sequence,1);
 assert.equal((await read(paths[0])).data.sequence,2);
});
test('failed requests do not poison retry or erase other endpoint observations',async()=>{
 let calls=0;
 const read=createPublicAcceptanceReader({fetchImpl:async()=>{
  if(++calls===1)throw new Error('provider_timeout');
  return Response.json({ok:true,state:'PASSWORD_AUTH_READY'});
 }});
 await assert.rejects(()=>read(paths[0]),/provider_timeout/);
 assert.equal((await read(paths[1])).data.state,'PASSWORD_AUTH_READY');
 assert.equal((await read(paths[0])).response.ok,true);
 assert.equal(calls,3);
});
test('HTTP failure and invalid JSON remain failure evidence',async()=>{
 const read=createPublicAcceptanceReader({fetchImpl:async()=>new Response('unavailable',{status:503})});
 const result=await read(paths[0]);
 assert.equal(result.response.ok,false);assert.equal(result.data.ok,false);
 assert.equal(result.data.state,'INVALID_RESPONSE');
});
test('a slow public read is aborted within its bounded budget',async()=>{
 const read=createPublicAcceptanceReader({timeoutMs:15,fetchImpl:(_url,{signal})=>new Promise((_,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 })});
 const keepAlive=setTimeout(()=>{},100);
 try{await assert.rejects(()=>read(paths[0]),error=>error.name==='TimeoutError')}
 finally{clearTimeout(keepAlive)}
});
test('status, access and checkout share the corrected public path while member and charge auth remain',()=>{
 for(const file of ['status.ts','access.ts','checkout.ts']){
  const code=readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
  assert.match(code,/import \{readPublicAcceptance\} from '\.\/public-acceptance-connection\.mjs'/);
 }
 const checkout=readFileSync(new URL('../src/checkout.ts',import.meta.url),'utf8');
 assert.match(checkout,/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(checkout,/headers:\{apikey:KEY,Authorization:'Bearer '\+token,Accept:'application\/json'\}/);
 assert.match(checkout,/headers:\{apikey:KEY,Authorization:'Bearer '\+token,'Content-Type':'application\/json'/);
});
