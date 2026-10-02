import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {marketAssetView} from '../src/live-monitor.mjs';
const frontend=await readFile(new URL('../src/public-surfaces.ts',import.meta.url),'utf8');
const begin=frontend.indexOf('async function loadLiveMarkets()');
const source=stripTypeScriptTypes(frontend.slice(begin,frontend.indexOf('\nasync function loadGold()',begin)));
class Element {
  children=[]; textContent=''; className='';
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);}
  replaceChildren(...children){this.children=children;}
}
function fixture() {
  const grid=new Element(), values=new Map(); let data;
  const document={createElement:() => new Element()};
  const first=(...values) => values.find(value => value!=null && value!=='');
  const load=new Function('read','set','first','assetList','marketStatus','marketAssetView','byId','document',`${source}\nreturn loadLiveMarkets;`)(
    async path => path==='public-live-markets-api'?data:{},(id,text)=>values.set(id,text),first,
    data=>Array.isArray(data?.assets)?data.assets:[],data=>data?.market_status||'UNKNOWN',marketAssetView,()=>grid,document);
  return {grid,values,run:async value=>{data=value;return load();}};
}
test('the actual live market loader renders regime state and treats asset labels as text', async () => {
  const ctx=fixture(); const hostile='<img src=x onerror=alert(1)>';
  const observation=await ctx.run({ok:true,market_status:'DELAYED_LIVE',regime:{state:'RISK_ON'},assets:[{key:'gold',label:hostile,price:4220,state:'WATCH',market_time:'2026-10-02T14:00:00Z'}]});
  assert.equal(ctx.values.get('market-regime'),'RISK_ON'); assert.equal(observation.available,true);
  assert.equal(ctx.grid.children[0].children[0].textContent,hostile);
  assert.equal(ctx.grid.children[0].children[1].textContent,'4220');
});
test('an unavailable refresh replaces prior prices and reports no successful data update', async () => {
  const ctx=fixture(); await ctx.run({ok:true,market_status:'DELAYED_LIVE',assets:[{key:'gold',price:4220}]});
  const observation=await ctx.run({ok:false,state:'UNAVAILABLE'});
  assert.equal(observation.available,false); assert.equal(ctx.grid.children.length,1);
  assert.match(ctx.grid.children[0].textContent,/unavailable/);
  assert.equal(ctx.grid.children[0].children.length,0);
});
test('the actual loader withholds stale snapshot prices while preserving observation context', async () => {
  const ctx=fixture(); const result=await ctx.run({ok:true,market_status:'STALE',assets:[{key:'gold',price:4220,state:'BULLISH_CONFIRMED'}]});
  assert.equal(result.available,false); assert.equal(ctx.grid.children[0].children[1].textContent,'WITHHELD');
  assert.match(ctx.grid.children[0].children[2].textContent,/STALE · 0R/);
});
test('upstream setup allowances cannot change live market execution permission', async () => {
  const ctx=fixture();
  const result=await ctx.run({ok:true,market_status:'DELAYED_LIVE',
    decision:{action:'EVALUATE',capital_permission:'MAX_0.25R'},
    assets:[{key:'gold',price:4220,action:'EVALUATE',capital_permission:'MAX_0.25R'}]});
  assert.equal(result.available,true);
  assert.equal(ctx.values.get('gold-action'),'WAIT');
  assert.equal(ctx.values.get('gold-capital'),'0R');
  assert.match(ctx.grid.children[0].children[2].textContent,/0R/);
});
test('the actual Gold loader keeps the desk and firewall locked when research feeds suggest risk', async () => {
  const start=frontend.indexOf('async function loadGold()');
  const goldSource=stripTypeScriptTypes(frontend.slice(start,frontend.indexOf('\nfunction renderV132ShadowStudies',start)));
  const values=new Map(), first=(...values)=>values.find(value=>value!=null && value!=='');
  const gold={ok:true,market_status:'DELAYED_LIVE',price:4220,engine:{state:'HERO_REPAIR',action:'EVALUATE',capital_permission:'MAX_0.25R'}};
  const desk={ok:true,current_read:{action_permitted:'EVALUATE',capital_permission:'MAX_0.25R'}};
  const load=new Function('read','readLocal','set','first','setupBrokerGoldBridge',`${goldSource}\nreturn loadGold;`)(
    async path=>path==='public-gold-live-xauusd'?gold:path==='public-gold-execution-desk'?desk:{},
    async ()=>({}),(id,text)=>values.set(id,text),first,()=>{});
  const result=await load();
  assert.equal(result.available,true); assert.equal(values.get('gold-price'),4220);
  assert.equal(values.get('gold-live-state'),'HERO_REPAIR');
  assert.equal(values.get('gold-live-action'),'WAIT'); assert.equal(values.get('gold-live-capital'),'0R');
  assert.equal(values.get('gold-firewall'),'WAIT · 0R');
  assert.equal(values.get('v117-decision'),'WAIT · 0R');
});
