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

test('V200 install snippet smoke-tests first tick before continuous relay',()=>{
 const s=liveMarketBridgeInstallSnippet({ok:true,bridge_id:7,bridge_key:'tfa_live_'+'b'.repeat(43),provider_symbol:'XAUUSD'});
 const once=s.indexOf('mt5-live-market-bridge.py --once');
 const verify=s.indexOf('gold-relay-observability-v199');
 const continuous=s.lastIndexOf('python .\\\\mt5-live-market-bridge.py');
 assert.ok(once>=0);
 assert.ok(verify>once);
 assert.ok(continuous>verify);
 assert.match(s,/continuous mode was not started/i);
 assert.match(s,/first_tick_seen/);
});

test('V201 doctor runs before V200 one-shot and continuous modes',()=>{
 const s=liveMarketBridgeInstallSnippet({ok:true,bridge_id:9,bridge_key:'tfa_live_'+'c'.repeat(43),provider_symbol:'XAUUSD'});
 const doctorDownload=s.indexOf('mt5-live-market-doctor.py -OutFile');
 const doctorRun=s.indexOf('python .\\\\mt5-live-market-doctor.py');
 const once=s.indexOf('mt5-live-market-bridge.py --once');
 const verify=s.indexOf('gold-relay-observability-v199');
 const continuous=s.lastIndexOf('python .\\\\mt5-live-market-bridge.py');
 assert.ok(doctorDownload>=0);
 assert.ok(doctorRun>doctorDownload);
 assert.ok(once>doctorRun);
 assert.ok(verify>once);
 assert.ok(continuous>verify);
 assert.match(s,/V201 relay doctor found a failed prerequisite/);
});
