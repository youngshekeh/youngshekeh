import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const src=await readFile(new URL('../public/downloads/mt5-live-market-launcher-v205.ps1',import.meta.url),'utf8');

test('V205 launcher preserves doctor -> one-shot -> V204 verification -> continuous order',()=>{
 const doctor=src.indexOf('python $doctor');
 const once=src.indexOf('python $relay --once');
 const verify=src.indexOf('gold-activation-orchestrator-v204');
 const continuous=src.lastIndexOf('python $relay');
 assert.ok(doctor>=0);
 assert.ok(once>doctor);
 assert.ok(verify>once);
 assert.ok(continuous>verify);
});

test('V205 launcher fails closed and never contains an order path',()=>{
 assert.match(src,/Orders OFF · Capital 0R/);
 assert.match(src,/first_tick_accepted/);
 assert.match(src,/MetaTrader5==5\.0\.6231/);
 assert.doesNotMatch(src,/order_send|OrderSend|position_close|trade\.Buy|trade\.Sell|mt5\.login/i);
 assert.doesNotMatch(src,/Write-Host.*TFA_LIVE_BRIDGE_KEY/i);
});
