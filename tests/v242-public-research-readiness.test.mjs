import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPublicResearchAvailability} from '../src/public-research-readiness.mjs';
const now=Date.parse('2026-10-22T12:50:00Z');
const packet=()=>({ok:true,reference_only:true,not_for_trade_execution:true,
 governance:{capital_permission:'0R',live_order_submission_enabled:false},
 assets:{gold:{symbol:'XAUUSD',currency:'USD',type:'INDICATIVE_SPOT',source:'Gold API',
 broker_verified:false,execution_quote:false,price:4050,source_updated_at:new Date(now-15000).toISOString()},
 bitcoin:{symbol:'BTCUSD',currency:'USD',type:'SPOT_RECEIPT_NOT_SOURCE_TIMESTAMPED',source:'Coinbase',
 broker_verified:false,execution_quote:false,price:81000,observed_at:new Date(now-5000).toISOString(),source_updated_at:null}}});
const read=(data,ok=true)=>({response:{ok},data});
test('website delivery and one authorized public reference source are distinct',()=>{
 const s=assessPublicResearchAvailability({pageServed:true,reference:read(packet())},now);
 assert.equal(s.page_state,'PAGE DELIVERED');assert.equal(s.reference_state,'ONE CURRENT SOURCE');
 assert.equal(s.verified_references,1);assert.equal(s.gold_reference_current,true);assert.equal(s.bitcoin_reference_current,false);
});
test('missing provider reports partial public service',()=>{
 const p=packet();p.assets.bitcoin=null;
 const s=assessPublicResearchAvailability({pageServed:true,reference:read(p)},now);
 assert.equal(s.reference_state,'ONE CURRENT SOURCE');assert.equal(s.verified_references,1);
});
test('stale, future and tampered observations cannot be counted',()=>{
 for(const corrupt of [p=>{p.assets.gold.source_updated_at=new Date(now-180000).toISOString();p.assets.bitcoin.observed_at=new Date(now-50000).toISOString();},
  p=>{p.assets.gold.source_updated_at=new Date(now+60000).toISOString();p.assets.bitcoin.observed_at=new Date(now+60000).toISOString();},
  p=>{p.governance.capital_permission='1R';},p=>{p.not_for_trade_execution=false;},
  p=>{p.assets.gold.execution_quote=true;p.assets.bitcoin.execution_quote=true;}]){
  const p=packet();corrupt(p);
  const s=assessPublicResearchAvailability({pageServed:true,reference:read(p)},now);
  assert.equal(s.verified_references,0);
 }
});
test('API outage cannot erase site delivery or claim live prices',()=>{
 const s=assessPublicResearchAvailability({pageServed:true,reference:read(packet(),false)},now);
 assert.equal(s.page_delivered,true);assert.equal(s.research_reference_available,false);
 assert.equal(s.reference_state,'NO CURRENT SOURCES');
});
test('research availability cannot certify private operations, trading or checkout',()=>{
 const s=assessPublicResearchAvailability({pageServed:true,reference:read(packet())},now);
 assert.equal(s.commercial_checkout_certified,false);assert.equal(s.private_kernel_certified,false);
 assert.equal(s.execution_quote_verified,false);assert.equal(s.trading_permission,'WAIT');assert.equal(s.capital_permission,'0R');
});
test('missing page delivery stays unverified even if reference service responds',()=>{
 const s=assessPublicResearchAvailability({reference:read(packet())},now);
 assert.equal(s.page_state,'NOT VERIFIED');assert.equal(s.verified_references,1);
});
