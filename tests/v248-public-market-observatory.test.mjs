import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {currentResearchObservations,retainTabObservation,tabSamplePath,PUBLIC_POLL_MS} from '../src/market-observatory-core.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=Date.parse('2026-10-22T19:50:00.000Z');
const packet={
 ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},
 assets:{
  gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',price:4051.25,source_updated_at:'2026-10-22T19:49:30.000Z',broker_verified:false,execution_quote:false},
  bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',price:82001,source_updated_at:null,observed_at:'2026-10-22T19:49:55.000Z',broker_verified:false,execution_quote:false}
 }
};
test('valid independent references are research only with distinct timestamp meaning',()=>{
 const r=currentResearchObservations(packet,now);
 assert.equal(r.count,2);assert.equal(r.order_submission,false);
 assert.equal(r.capital_permission,'0R');
 assert.equal(r.provider_source_time_gold,packet.assets.gold.source_updated_at);
 assert.equal(r.provider_source_time_bitcoin,null);
});
test('expired gold source or bitcoin HTTP receipt is immediately withheld',()=>{
 const old=currentResearchObservations(packet,now+121000);
 assert.equal(old.count,0);assert.equal(old.gold,null);assert.equal(old.bitcoin,null);
 const goldOnly=currentResearchObservations(packet,now+31000);
 assert.equal(goldOnly.count,1);assert.equal(goldOnly.bitcoin,null);
});
test('fake broker execution flag or privileged capital rejects entire payload',()=>{
 assert.equal(currentResearchObservations({...packet,governance:{capital_permission:'1R',live_order_submission_enabled:false}},now).count,0);
 assert.equal(currentResearchObservations({...packet,assets:{...packet.assets,gold:{...packet.assets.gold,broker_verified:true}}},now).gold,null);
 assert.equal(currentResearchObservations({...packet,assets:{...packet.assets,bitcoin:{...packet.assets.bitcoin,source_updated_at:'2026-10-22T19:49:55.000Z'}}},now).bitcoin,null);
});
test('tab observations never backfill, repeat, reorder or fabricate missing values',()=>{
 const a={value:4050,at:'2026-10-22T19:45:00Z',source:'Gold API'};
 const b={value:4052,at:'2026-10-22T19:46:00Z',source:'Gold API'};
 let h=retainTabObservation([],a);
 h=retainTabObservation(h,a);assert.equal(h.length,1);
 h=retainTabObservation(h,b);assert.equal(h.length,2);
 assert.deepEqual(retainTabObservation(h,a),h);
 assert.deepEqual(retainTabObservation(h,null),h);
 assert.equal(tabSamplePath(h).startsWith('M'),true);
 assert.equal(tabSamplePath([]),'');
 assert.equal(tabSamplePath([a]),'');
});
test('observations bounded without inventing simulated ticks',()=>{
 let h=[];
 for(let i=0;i<150;i++)h=retainTabObservation(h,{value:4000+i,at:new Date(now+i*15000).toISOString(),source:'Gold API'});
 assert.equal(h.length,120);assert.equal(h[0].value,4030);
 assert.equal(PUBLIC_POLL_MS,15000);
});
test('source and route have no private database, order or payment dependencies',()=>{
 const html=read('market-observatory/index.html');
 const js=read('src/market-observatory.mjs');
 const core=read('src/market-observatory-core.mjs');
 const css=read('src/market-observatory.css');
 const vite=read('vite.config.ts');
 assert.match(vite,/marketObservatory:/);
 assert.match(html,/<title>Market Observatory/);
 assert.match(html,/RESEARCH-ONLY ACCESS/);
 assert.match(html,/No account, no private database dependency/);
 assert.match(js,/verified/); // source qualification in history caption
 assert.match(js,/fetch\('\/api\/public-market-reference'/);
 assert.match(js,/setInterval\(update,1000\)/);
 assert.doesNotMatch(js+core, /supabase|SUPABASE|postgres|execute_trade|place_order|auth-token|service_role|payment.*provider/i);
 assert.match(css,/body\.observatory-page/);
});
