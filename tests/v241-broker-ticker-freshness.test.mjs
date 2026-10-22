import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {brokerTickerView} from '../src/broker-ticker-view.mjs';
import {withholdResearchPanel} from '../src/research-panel-state.mjs';
import livePriceHandler from '../api/gold-live-price.js';
const now=Date.now();
const sample=()=>({ok:true,state:'BROKER_LIVE',quote:{bid:4060,mid:4060.5,ask:4061,
 age_seconds:1,observed_at:new Date(now-1000).toISOString()},quality:{},source:{connected:true}});
test('both supported broker status shapes require actual fresh, ordered bid/ask evidence',()=>{
 const data=sample();assert.equal(brokerTickerView(data,now).verified,true);
 assert.equal(brokerTickerView({ok:true,live_broker:data},now).verified,true);
 for(const mutate of [d=>d.quote.observed_at=new Date(now-6000).toISOString(),d=>d.quote.age_seconds=null,
  d=>d.quote.mid=null,d=>d.quote.bid=5000,d=>d.quote.observed_at=new Date(now+2000).toISOString(),d=>d.ok=false]){
  const packet=sample();mutate(packet);const view=brokerTickerView(packet,now);assert.equal(view.verified,false);assert.equal(view.quote,null);
 }
});
test('a stalled network cannot preserve the former broker price after five seconds',()=>{
 const data=sample();assert.equal(brokerTickerView(data,now).verified,true);
 assert.equal(brokerTickerView(data,now+5001).quote,null);
});
test('the actual ticker renderer clears former global and broker prices on source failure',()=>{
 const source=readFileSync(new URL('../src/public-surfaces.ts',import.meta.url),'utf8');
 const start=source.indexOf('function renderV186LiveGoldTicker('),end=source.indexOf('\nasync function pollV186',start);
 const nodes=new Map(['gold-market','gold-price','v186-mid','v186-bid','v186-ask','v186-live-state','v186-detail','v121-broker-age','v117-broker-feed'].map(id=>[id,{id,tagName:'STRONG',textContent:'OLD PRICE'}]));
 nodes.get('gold-market').textContent='BROKER LIVE · XAUUSD';
 const document={querySelectorAll:()=>[...nodes.values()].filter(x=>x.id.startsWith('v186-'))};
 const set=(id,value)=>{if(nodes.has(id))nodes.get(id).textContent=value==null?'WITHHELD':String(value);};
 const render=new Function('brokerTickerView','withholdResearchPanel','document','set','byId',
  'let latestLiveBrokerData=null;'+stripTypeScriptTypes(source.slice(start,end))+'\nreturn renderV186LiveGoldTicker;')(
   brokerTickerView,withholdResearchPanel,document,set,id=>nodes.get(id));
 render({ok:false,state:'UNAVAILABLE'});
 assert.equal(nodes.get('gold-price').textContent,'WITHHELD');assert.equal(nodes.get('v186-mid').textContent,'WITHHELD');
 assert.equal(nodes.get('gold-market').textContent,'BROKER QUOTE UNVERIFIED');assert.equal(nodes.get('v186-live-state').textContent,'UNAVAILABLE');
 assert.match(source,/if\(latestLiveBrokerData && !brokerTickerView\(latestLiveBrokerData,now\).verified\)/);
});
test('the proxy proof header recognizes both verified broker contracts without granting execution',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const nested of [false,true]){
   const data=sample();data.quote.observed_at=new Date().toISOString();
   const packet=nested?{ok:true,live_broker:data}:data;
   globalThis.fetch=async()=>Response.json(packet);
   const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;}};
   await livePriceHandler({method:'GET'},res);
   assert.equal(res.headers['X-TFA-Broker-Proof'],'FRESH_READ_ONLY_MT5');
   assert.deepEqual(res.body,packet,'the proxy never adds execution authority');
  }
 }finally{globalThis.fetch=previous;}
});
