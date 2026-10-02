import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../supabase/functions/runtime-v115-autonomous-qa/index.ts',import.meta.url),'utf8');
test('V190 autonomous QA probes the complete V186-V189 Gold stack',()=>{
 for(const path of ['/api/gold-live-price','/api/gold-signal-map','/api/gold-session-liquidity','/api/gold-signal-lifecycle','/api/gold-trigger-watch-v189'])
   assert.match(source,new RegExp(path.replaceAll('/','\\/')));
 for(const name of ['v190_live_xauusd_runtime_contract','v190_signal_map_runtime_contract','v190_session_liquidity_runtime_contract','v190_signal_lifecycle_runtime_contract','v190_trigger_watch_runtime_contract'])
   assert.match(source,new RegExp(name));
 assert.match(source,/capital_permission==='0R'/);
 assert.match(source,/machine_execution_allowed===false/);
});
