import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/q4-machine-state.js';
import {researchNumber,researchSourceStatus} from '../src/q4-research-integrity.mjs';
function fixture(){
 const at=new Date(Date.now()-1000).toISOString();
 return {ok:true,usable_sources:3,generated_at:at,
  day:{ok:true,current:{price:4060,market_time:at},day_state:{day_state:'LOW_SWEEP'}},
  zones:{ok:true,price:4060,market_time:at,zones:[],daily_pivots:{r2:null,r3:4100}},
  liquidity:{ok:true,price:4060,market_time:at,state:{direction:'UP',acceptance:'RECLAIM'},
   liquidity_map:{nearest_above:{price:4100,label:'TEST_HIGH'},nearest_below:{price:null,label:'MISSING'}}}};
}
async function run(bundle){
 const previous=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>bundle});
 try{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return body;}};
  await handler({method:'GET'},res);return res;
 }finally{globalThis.fetch=previous;}
}
test('absent, blank, boolean and structured numeric values remain unknown',()=>{
 for(const value of [null,undefined,'','   ',false,true,[],[1],{},NaN,Infinity])assert.equal(researchNumber(value),null);
 assert.equal(researchNumber(0),0);assert.equal(researchNumber('4060.5'),4060.5);
});
test('missing Day price falls back to a real timestamped zone price rather than zero',async()=>{
 const bundle=fixture();bundle.day.current.price=null;
 const result=await run(bundle);assert.equal(result.body.price,4060);
 assert.equal(result.body.heartbeat.state,'SYNCHRONIZED');
 assert.equal(result.body.scenario_tree.downside.length,0,'null levels cannot become zero-price liquidity');
 assert.equal(result.body.scenario_tree.upside[0].price,4100);
});
test('fresh response-generation times cannot turn missing market observations into synchronized data',async()=>{
 const bundle=fixture();
 delete bundle.day.current.market_time;delete bundle.zones.market_time;delete bundle.liquidity.market_time;
 for(const source of [bundle.day,bundle.zones,bundle.liquidity])source.generated_at=bundle.generated_at;
 const result=await run(bundle);
 assert.equal(result.body.price,null);assert.equal(result.body.heartbeat.state,'DEGRADED');
 assert.equal(result.body.heartbeat.source_age_seconds,null);assert.equal(result.body.transmutation.rule_score,null);
 assert.deepEqual(result.body.scenario_tree.upside,[]);assert.deepEqual(result.body.scenario_tree.downside,[]);
 assert.equal(result.body.governance.capital_permission,'0R');
});
test('stale and future observations are withheld while bundle receipt time remains separately labeled',async()=>{
 for(const offset of [-901000,10000]){
  const bundle=fixture(),at=new Date(Date.now()+offset).toISOString();
  bundle.day.current.market_time=at;bundle.zones.market_time=at;bundle.liquidity.market_time=at;
  const result=await run(bundle);assert.equal(result.body.price,null);assert.equal(result.body.heartbeat.state,'DEGRADED');
  assert.ok(result.body.heartbeat.bundle_age_seconds<10);
 }
});
test('failed sources cannot supply prices and declared source totals cannot manufacture availability',async()=>{
 const bundle=fixture();
 for(const key of ['day','zones','liquidity'])bundle[key].ok=false;
 const result=await run(bundle);assert.equal(result.statusCode,503);assert.equal(result.body.ok,false);
 assert.equal(result.body.governance.capital_permission,'0R');
});
test('provider timestamps must be explicit ISO observations rather than generated response metadata',()=>{
 const now=Date.now();
 assert.equal(researchSourceStatus({ok:true,generated_at:new Date(now).toISOString()},now).recent,false);
 assert.equal(researchSourceStatus({ok:true,market_time:new Date(now-30000).toISOString()},now).recent,true);
 assert.equal(researchSourceStatus({ok:true,market_time:new Date(now+10000).toISOString()},now).current,false);
});
