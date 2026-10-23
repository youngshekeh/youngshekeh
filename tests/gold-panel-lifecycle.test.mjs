import test from 'node:test';
import assert from 'node:assert/strict';
import {startGoldPanelLifecycle} from '../src/gold-panel-lifecycle.mjs';
import {goldDisplay} from '../src/public-gold-display.mjs';
function fixture(){
 const page=new EventTarget(),visibility=new EventTarget(),timers=new Map();let id=0;
 visibility.hidden=false;page.setInterval=(fn,ms)=>{timers.set(++id,{fn,ms});return id;};page.clearInterval=id=>timers.delete(id);
 return {page,visibility,timers};
}
test('page-cache restore restarts polling and expiry without duplicate timers',()=>{
 const f=fixture();let reads=0,paints=0;
 const dispose=startGoldPanelLifecycle({...f,paint:()=>paints++,refresh:()=>reads++,every:5000});
 assert.equal(reads,1);assert.equal(f.timers.size,2);
 f.page.dispatchEvent(new Event('pagehide'));assert.equal(f.timers.size,0);
 f.page.dispatchEvent(new Event('pageshow'));assert.equal(reads,2);assert.equal(paints,1);assert.equal(f.timers.size,2);
 f.page.dispatchEvent(new Event('pageshow'));assert.equal(f.timers.size,2);
 for(const t of f.timers.values())t.fn();assert.equal(reads,4);
 dispose();assert.equal(f.timers.size,0);f.page.dispatchEvent(new Event('pageshow'));assert.equal(f.timers.size,0);
});
test('restored panel clears expired quote immediately even while refresh is pending',()=>{
 const f=fixture();let now=Date.now(),shown=null,reads=0;
 const body={ok:true,governance:{capital_permission:'0R',live_order_submission_enabled:false},feed:{gold_spot:{symbol:'XAUUSD',currency:'USD',price:4000,source:'Gold API',market_time:new Date(now).toISOString(),quote_type:'spot_indicative'}}};
 const paint=()=>{shown=goldDisplay(body,now).price;};
 startGoldPanelLifecycle({...f,paint,refresh:()=>{reads++;return new Promise(()=>{});},every:15000});
 paint();assert.equal(shown,4000);f.page.dispatchEvent(new Event('pagehide'));now+=121000;
 f.page.dispatchEvent(new Event('pageshow'));assert.equal(shown,null);assert.equal(reads,2);
 f.visibility.hidden=true;f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(reads,2);
 for(const t of f.timers.values())t.fn();assert.equal(reads,2);
 f.visibility.hidden=false;f.visibility.dispatchEvent(new Event('visibilitychange'));assert.equal(reads,3);
});
