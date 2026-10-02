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
