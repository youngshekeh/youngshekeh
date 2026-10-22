import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifiedPublicReferences} from '../src/v235-reference-integrity.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const NOW=Date.parse('2026-10-22T12:00:00Z');
const packet={ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},assets:{
 gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',price:4060,
  source_updated_at:new Date(NOW).toISOString(),broker_verified:false,execution_quote:false},
 bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',price:81000,
  source_updated_at:null,observed_at:new Date(NOW).toISOString(),broker_verified:false,execution_quote:false}}};
const client=read('src/public-market-reference.mjs').replace(/^import .*;\r?\n/gm,'');

for(const route of ['gold-live','live-markets','visual-lab']){
 test(`${route}: real page mounts the shared feed without private-engine data and expires quotes`,async()=>{
  const html=read(route+'/index.html');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'',dataset:{}}]));
  for(const id of ['public-market-reference','pmr-gold','pmr-btc','pmr-status','pmr-updated','pmr-gold-info','pmr-btc-info']){
   assert.equal(ids.filter(found=>found===id).length,1,`${id} must mount exactly once`);
  }
  assert.equal((html.match(/src="\.\.\/src\/public-market-reference\.mjs"/g)||[]).length,1);
  assert.match(html,/src="\.\.\/src\/public-surfaces\.ts"/);
  assert.match(html,/src="\.\.\/src\/public-gold-launch\.mjs"/);
  let clock=NOW,calls=0;
  const intervals=new Map();let next=0;
  const window={dispatchEvent(){},addEventListener(){},setInterval(fn,ms){const id=++next;intervals.set(id,{fn,ms});return id;},clearInterval(id){intervals.delete(id);}};
  const document={hidden:false,getElementById:id=>nodes[id]??null,addEventListener(){},removeEventListener(){}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  class CustomEvent{constructor(type,{detail}){this.type=type;this.detail=detail;}}
  const fetch=async path=>{calls++;assert.equal(path,'/api/public-market-reference');return {ok:true,json:async()=>packet};};
  new Function('verifiedPublicReferences','window','document','Date','fetch','CustomEvent',client)(
   verifiedPublicReferences,window,document,Clock,fetch,CustomEvent);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);
  assert.equal(nodes['pmr-gold'].textContent,'$4,060.00');
  assert.equal(nodes['pmr-btc'].textContent,'$81,000.00');
  assert.equal(nodes['pmr-status'].textContent,'2 SOURCES RESPONDING');
  document.hidden=true;clock=NOW+120001;
  for(const t of intervals.values())t.fn();
  assert.equal(calls,1,'hidden pages must not request another provider read');
  assert.equal(nodes['pmr-gold'].textContent,'Unavailable');
  assert.equal(nodes['pmr-btc'].textContent,'Unavailable');
  assert.equal(nodes['pmr-status'].textContent,'NO FRESH REFERENCE');
 });
}
