import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedPublicReferences} from '../src/v235-reference-integrity.mjs';
const NOW=Date.parse('2026-10-22T10:00:00Z');
function sample(at=NOW){return {ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},assets:{
 gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',price:4100,source_updated_at:new Date(at).toISOString(),broker_verified:false,execution_quote:false},
 bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',price:82000,observed_at:new Date(at).toISOString(),source_updated_at:null,broker_verified:false,execution_quote:false}}};}
const source=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function fixture(packet){
 let clock=NOW,calls=0,next=packet,fetcher=async()=>({ok:true,json:async()=>next});
 const nodes={};
 function node(){return {textContent:'',dataset:{},children:[],classList:{contains:()=>false,add(){}},
 append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},
 querySelector(s){return this.children[s==='strong'?1:2]||null;}};}
 for(const id of ['public-market-reference','pmr-gold','pmr-btc','pmr-status','pmr-updated','pmr-gold-info','pmr-btc-info','marketTileGrid','marketPattern','marketBreadth','marketUsable','independentLaneState'])nodes[id]=node();
 nodes.marketTileGrid.querySelectorAll=()=>[];nodes.marketBreadth.textContent='Breadth unavailable';nodes.marketUsable.textContent='0/7';
 const listeners=new Map(),timers=new Map();let serial=0;
 const on=(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);};
 const off=(name,fn)=>listeners.get(name)?.delete(fn);
 const window={addEventListener:on,removeEventListener:off,dispatchEvent(e){for(const fn of [...(listeners.get(e.type)||[])])fn(e);},
 setInterval(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearInterval(id){timers.delete(id);}};
 const document={hidden:false,getElementById:id=>nodes[id],createElement:node,addEventListener:on,removeEventListener:off};
 class Clock extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 class CustomEvent {constructor(type,{detail}){this.type=type;this.detail=detail;}}
 const verify=p=>verifiedPublicReferences(p,clock);
 new Function('verifiedPublicReferences','window','document','Date',source('v235-public-board.mjs'))(verify,window,document,Clock);
 new Function('verifiedPublicReferences','window','document','Date','fetch','CustomEvent',source('public-market-reference.mjs'))(verify,window,document,Clock,async(...args)=>{calls++;return fetcher(...args);},CustomEvent);
 return {nodes,window,document,timers,calls:()=>calls,setClock:v=>{clock=v;},setPacket:p=>{next=p;},
 setFetch:f=>{fetcher=f;},emit:name=>window.dispatchEvent({type:name}),
 tick:ms=>{for(const t of [...timers.values()])if(t.ms===ms)t.fn();}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('both actual displays keep BTC unlicensed while Gold accepts bounded clock skew',async()=>{
 const f=fixture(sample(NOW+2000));await settle();
 assert.match(f.nodes['pmr-status'].textContent,/PARTIAL SOURCES/);assert.equal(f.nodes.independentLaneState.textContent,'1/2 PUBLIC SOURCES');
 assert.equal(f.nodes['pmr-btc'].textContent,'Unavailable');
 assert.match(f.nodes['pmr-btc-info'].textContent,/licensed source required/);
 assert.equal(verifiedPublicReferences(sample(NOW+5001),NOW).count,0);
});
test('prices expire together while hidden and while the next network request is stalled, without extra polling',async()=>{
 const f=fixture(sample());await settle();assert.equal(f.calls(),1);
 f.setFetch(()=>new Promise(()=>{}));f.tick(15000);await settle();assert.equal(f.calls(),2);
 f.document.hidden=true;f.setClock(NOW+30001);f.tick(1000);
 assert.equal(f.nodes['pmr-btc'].textContent,'Unavailable');assert.equal(f.nodes.independentLaneState.textContent,'1/2 PUBLIC SOURCES');
 f.setClock(NOW+120001);f.tick(1000);
 assert.equal(f.nodes['pmr-gold'].textContent,'Unavailable');assert.equal(f.nodes.independentLaneState.textContent,'0/2 PUBLIC SOURCES');
 assert.equal(f.calls(),2);
});
test('back-forward restoration restarts one set of timers and clears stale values before refreshing',async()=>{
 const f=fixture(sample());await settle();assert.equal(f.timers.size,3);
 f.emit('pagehide');assert.equal(f.timers.size,0);
 f.setClock(NOW+130000);f.setFetch(()=>new Promise(()=>{}));f.emit('pageshow');
 assert.equal(f.nodes['pmr-gold'].textContent,'Unavailable');assert.equal(f.nodes.independentLaneState.textContent,'0/2 PUBLIC SOURCES');
 assert.equal(f.timers.size,3);f.emit('pageshow');assert.equal(f.timers.size,3);
});
test('spoofed source and execution permissions are rejected consistently by both displays',async()=>{
 for(const change of [p=>p.governance.live_order_submission_enabled=true,p=>p.assets.gold.source='Unverified',p=>p.assets.bitcoin.execution_quote=true]){
  const packet=sample();change(packet);const f=fixture(packet);await settle();
  const expected=verifiedPublicReferences(packet,NOW);
  assert.equal(f.nodes.independentLaneState.textContent,expected.count+'/2 PUBLIC SOURCES');
  assert.equal(f.nodes['pmr-gold'].textContent==='Unavailable',!expected.gold);
  assert.equal(f.nodes['pmr-btc'].textContent==='Unavailable',!expected.bitcoin);
 }
});
