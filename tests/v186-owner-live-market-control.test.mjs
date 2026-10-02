import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareLiveMarketBridgeCreate,liveMarketBridgeInstallSnippet} from '../src/owner-live-market-control.mjs';
test('valid V186 enrollment is XAUUSD-only',()=>{
 const r=prepareLiveMarketBridgeCreate({label:'Live Gold',sourceCode:'MT5_LIVE_XAU',providerSymbol:'XAUUSDm'});
 assert.equal(r.ok,true);assert.equal(r.payload.action,'create');assert.equal(r.payload.provider_symbol,'XAUUSDm');
});
test('non-XAU symbol is rejected',()=>assert.equal(prepareLiveMarketBridgeCreate({label:'x',sourceCode:'MT5_LIVE_XAU',providerSymbol:'EURUSD'}).ok,false));
test('install snippet accepts only V186 one-time live key',()=>{
 const s=liveMarketBridgeInstallSnippet({ok:true,bridge_id:3,bridge_key:'tfa_live_'+'a'.repeat(43),provider_symbol:'XAUUSD'});
 assert.match(s,/TFA_LIVE_BRIDGE_ID="3"/);assert.match(s,/mt5-live-market-bridge\.py/);
 assert.equal(liveMarketBridgeInstallSnippet({ok:true,bridge_id:3,bridge_key:'tfa_demo_'+'a'.repeat(43),provider_symbol:'XAUUSD'}),'');
});


test('V205 install snippet delegates the local sequence to the hardened launcher',()=>{
 const s=liveMarketBridgeInstallSnippet({ok:true,bridge_id:7,bridge_key:'tfa_live_'+'b'.repeat(43),provider_symbol:'XAUUSD'});
 assert.match(s,/TFA_LIVE_BRIDGE_ID="7"/);
 assert.match(s,/TFA_LIVE_BRIDGE_KEY="tfa_live_/);
 assert.match(s,/TFA_MT5_SYMBOL="XAUUSD"/);
 assert.match(s,/mt5-live-market-launcher-v205\.ps1/);
 assert.doesNotMatch(s,/gold-relay-observability-v199/);
});
