import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareBridgeCreate,bridgeInstallSnippet} from '../src/owner-bridge-control.mjs';
test('valid bridge enrollment keeps sandbox identity narrow',()=>{
 const r=prepareBridgeCreate({label:'MT5 Demo',sourceCode:'MT5_DEMO',providerSymbol:'XAUUSDm'});
 assert.equal(r.ok,true);assert.deepEqual(r.payload,{action:'create',bridge_label:'MT5 Demo',source_code:'MT5_DEMO',provider_symbol:'XAUUSDm'});
});
for(const x of [
 {label:'',sourceCode:'MT5_DEMO',providerSymbol:'XAUUSD'},
 {label:'Demo',sourceCode:'bad source',providerSymbol:'XAUUSD'},
 {label:'Demo',sourceCode:'MT5_DEMO',providerSymbol:'EURUSD'}
])test('invalid bridge enrollment '+JSON.stringify(x),()=>assert.equal(prepareBridgeCreate(x).ok,false));
test('install snippet only accepts a one-time sandbox key',()=>{
 const s=bridgeInstallSnippet({ok:true,bridge_id:7,bridge_key:'tfa_demo_'+'a'.repeat(43),provider_symbol:'XAUUSDm'});
 assert.match(s,/TFA_BRIDGE_ID="7"/);assert.match(s,/TFA_BRIDGE_KEY="tfa_demo_/);assert.match(s,/mt5-demo-bridge\.py/);
 assert.equal(bridgeInstallSnippet({ok:true,bridge_id:7,bridge_key:'live_secret',provider_symbol:'XAUUSD'}),'');
});
