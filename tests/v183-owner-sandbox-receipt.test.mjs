import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSandboxReceipt,createSandboxReceiptSubmitter} from '../src/owner-sandbox-receipt.mjs';
const now=Date.parse('2026-10-02T17:00:00Z');
const base={mode:'BROKER_DEMO_SANDBOX',asset:'XAUUSD',provenance:'DEMO_BROKER_USER_SUPPLIED',source_code:'DEMO_01',provider_symbol:'XAUUSDm',sequence:1,observed_at:'2026-10-02T16:59:59Z'};
test('accepts quote, ack, fill and kill switch contracts',()=>{
 const cases=[
  {...base,event_type:'QUOTE',bid:4200,ask:4200.2},
  {...base,sequence:2,event_type:'ORDER_ACK',client_order_id:'TFA-1',broker_order_id:'B-1',side:'LONG',requested_r:.1,requested_price:4200},
  {...base,sequence:3,event_type:'FILL',client_order_id:'TFA-1',broker_order_id:'B-1',side:'LONG',requested_r:.1,requested_price:4200,fill_price:4200.1},
  {...base,sequence:4,event_type:'KILL_SWITCH_ACK',kill_switch_state:'ENGAGED'}
 ];
 for(const q of cases)assert.equal(prepareSandboxReceipt(JSON.stringify(q),now).ok,true);
});
for(const [name,change,error] of [
 ['live mode',{mode:'LIVE'},'sandbox_boundary_required'],['credential',{api_key:'never'},'unexpected_fields'],
 ['stale',{observed_at:'2026-10-02T16:59:30Z'},'stale_receipt'],['crossed',{event_type:'QUOTE',bid:4200,ask:4199},'invalid_bid_ask'],
 ['bad fill',{bid:undefined,ask:undefined,event_type:'FILL',client_order_id:'TFA-1',broker_order_id:'B-1',side:'LONG',requested_r:.1,requested_price:4200,fill_price:0},'invalid_fill']
])test(name,()=>assert.equal(prepareSandboxReceipt(JSON.stringify({...base,event_type:'QUOTE',bid:4200,ask:4200.2,...change}),now).error,error));
test('verified submission cannot promote capital',async()=>{
 const receipt={ok:true,sandbox_only:true,capital_permission:'0R',execution_grade:false,production_broker_verified:false,live_order_submission_enabled:false,state:'SANDBOX_RECEIPT_RECORDED',inserted:true,receipt_id:7,
 governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,production_broker_verified:false,sandbox_evidence_can_unlock_capital:false},certification:{state:'SANDBOX_EVIDENCE_COLLECTING'}};
 const s=createSandboxReceiptSubmitter({getSession:()=>({token:'x',owner:true,mfa:true}),now:()=>now,send:async()=>receipt});
 const out=await s.submit(JSON.stringify({...base,event_type:'QUOTE',bid:4200,ask:4200.2}));assert.equal(out.ok,true);assert.equal(out.receipt_id,7);
});
