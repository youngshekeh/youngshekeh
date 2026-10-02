import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('V184 public relay is identical to audited source and dependency is pinned',async()=>{
 const [source,published,requirements]=await Promise.all([
  readFile(new URL('../scripts/mt5-demo-bridge.py',import.meta.url),'utf8'),
  readFile(new URL('../public/downloads/mt5-demo-bridge.py',import.meta.url),'utf8'),
  readFile(new URL('../public/downloads/requirements-mt5-bridge.txt',import.meta.url),'utf8')
 ]);
 assert.equal(published,source);
 assert.equal(requirements.trim(),'MetaTrader5==5.0.6231');
 assert.doesNotMatch(published,/\border_send\s*\(/);
});
