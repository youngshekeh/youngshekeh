import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../api/gold-live-price.js',import.meta.url),'utf8')).replace('export default async function handler','async function handler');
function fixture(fetchImpl){
 const requests=[];const handler=new Function('fetch',`${source}\nreturn handler;`)(async(url,options)=>{requests.push({url,options});return fetchImpl(url,options);});
 async function run(method='GET',headers={}){let code=200;const out=new Map();const res={setHeader:(k,v)=>out.set(k.toLowerCase(),v),status(c){code=c;return this;},json:body=>({status:code,body,headers:out})};return handler({method,headers},res);}
 return{run,requests};
}
test('V186 proxy reads one fixed public endpoint and forwards no caller credentials',async()=>{
 const x=fixture(async()=>Response.json({ok:true,state:'BROKER_LIVE',quote:{mid:4165.2}}));
 const r=await x.run('GET',{authorization:'secret',cookie:'private'});assert.equal(r.status,200);
 assert.equal(x.requests[0].url,'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake');
 assert.equal(x.requests[0].options.headers.Authorization,undefined);assert.equal(x.requests[0].options.headers.cookie,undefined);
 assert.equal(r.headers.get('cache-control'),'no-store');
});
test('write methods are blocked before fetch',async()=>{const x=fixture(async()=>{throw new Error('must not fetch')});assert.equal((await x.run('POST')).status,405);assert.equal(x.requests.length,0);});
