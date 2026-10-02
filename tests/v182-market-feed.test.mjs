import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../api/market-feed.js',import.meta.url),'utf8'))
  .replace('export default async function handler','async function handler');

function fixture(fetchImpl = async () => Response.json({ok:true,market_status:'DELAYED_LIVE'})) {
  let clock=0, calls=0; const timers=new Map(), requests=[];
  const Clock=class extends Date {static now(){return clock;}};
  const handler=new Function('fetch','Date','setTimeout','clearTimeout',`${source}\nreturn handler;`)(
    async (url,options) => {calls++; requests.push({url,options}); return fetchImpl(url,options);},Clock,
    (callback,delay) => {const id=timers.size+1; timers.set(id,{callback,delay}); return id;},id=>timers.delete(id));
  async function run(url='/api/market-feed?feed=public-live-markets-api',method='GET',extra={}) {
    const headers=new Map(); let statusCode=200;
    const res={setHeader:(name,value)=>headers.set(name.toLowerCase(),value),
      status(code){statusCode=code;return this;},json:body=>({status:statusCode,body,headers})};
    return handler({url,method,...extra},res);
  }
  return {run,requests,timers,calls:()=>calls,advance:ms=>{clock+=ms;}};
}
test('the public bridge reads the fixed market endpoint without forwarding credentials', async () => {
  const ctx=fixture(); const result=await ctx.run(undefined,'GET',{headers:{authorization:'fixture-private-token',cookie:'fixture-cookie'}});
  assert.equal(result.status,200); assert.equal(result.body.market_status,'DELAYED_LIVE');
  assert.equal(ctx.requests[0].url,'https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-live-markets-api');
  assert.equal(ctx.requests[0].options.headers.Authorization,undefined);
  assert.equal(ctx.requests[0].options.headers.cookie,undefined);
  assert.equal(result.headers.get('cache-control'),'no-store');
  assert.equal(ctx.timers.size,0);
});
test('private runtimes, URL inputs, duplicate feeds and extra query parameters are rejected before fetch', async () => {
  const ctx=fixture();
  for (const url of ['/api/market-feed','/api/market-feed?feed=runtime-v115-mission-brief',
    '/api/market-feed?feed=https://example.com','/api/market-feed?feed=public-live-markets-api&feed=public-gold-live-api',
    '/api/market-feed?feed=public-live-markets-api&url=https://example.com',
    '/api/market-feed?feed=owner-gold-review-actions']) {
    assert.equal((await ctx.run(url)).status,400);
  }
  assert.equal(ctx.calls(),0);
});
test('write methods cannot pass through the market bridge', async () => {
  const ctx=fixture(); const result=await ctx.run(undefined,'POST');
  assert.equal(result.status,405); assert.equal(ctx.calls(),0); assert.equal(result.headers.get('allow'),'GET');
});
test('overlapping readers share one upstream request per feed', async () => {
  let finish; const ctx=fixture(() => new Promise(resolve => {finish=resolve;}));
  const a=ctx.run(),b=ctx.run(); assert.equal(ctx.calls(),1);
  finish(Response.json({ok:true})); await Promise.all([a,b]); assert.equal(ctx.calls(),1);
});
test('healthy public observations have a bounded fifteen-second instance cache', async () => {
  const ctx=fixture(); await ctx.run(); ctx.advance(14_999); await ctx.run(); assert.equal(ctx.calls(),1);
  ctx.advance(1); await ctx.run(); assert.equal(ctx.calls(),2);
});
test('expired healthy evidence is never served when the next upstream request fails', async () => {
  let fail=false; const ctx=fixture(async () => {if(fail)throw new Error('fixture outage');return Response.json({ok:true});});
  await ctx.run(); ctx.advance(15_001); fail=true;
  const result=await ctx.run(); assert.equal(result.status,503); assert.equal(result.body.ok,false);
  assert.equal(result.body.governance.capital_permission,'0R');
});
test('paper quotes are always re-read so the bridge cannot extend their expiry', async () => {
  const ctx=fixture(); await ctx.run('/api/market-feed?feed=paper-broker-quote-intake');
  await ctx.run('/api/market-feed?feed=paper-broker-quote-intake'); assert.equal(ctx.calls(),2);
});
test('malformed JSON, arrays and HTTP failures stay fail-closed and uncached', async () => {
  for (const make of [() => new Response('not json'),() => Response.json([]),() => Response.json({ok:true},{status:500})]) {
    const ctx=fixture(async () => make());
    assert.equal((await ctx.run()).status,503); assert.equal((await ctx.run()).status,503); assert.equal(ctx.calls(),2);
  }
});
test('the deadline aborts upstream work and never retries it', async () => {
  const ctx=fixture((url,options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',() => reject(new Error('aborted')))));
  const pending=ctx.run(); const timer=[...ctx.timers.values()][0];
  assert.equal(timer.delay,10_000); timer.callback();
  assert.equal((await pending).status,503); assert.equal(ctx.calls(),1); assert.equal(ctx.timers.size,0);
});
