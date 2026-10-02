import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const api=await readFile(new URL('../api/gold-alert-router-v192.js',import.meta.url),'utf8');
const edge=await readFile(new URL('../supabase/functions/public-gold-alert-router-v192/index.ts',import.meta.url),'utf8');
const sql=await readFile(new URL('../supabase/migrations/20261002193403_v192_gold_event_intelligence_alert_router.sql',import.meta.url),'utf8');

test('V192 Vercel route is fixed-source and read only',()=>{
  assert.match(api,/public-gold-alert-router-v192/);
  assert.match(api,/capital_permission:'0R'/);
  assert.doesNotMatch(api,/req\.query|req\.body/);
});
test('V192 public function reads only the governed router RPC',()=>{
  assert.match(edge,/get_v192_gold_alert_router/);
  assert.match(edge,/priority_score_not_probability:true/);
  assert.match(edge,/alerts_are_review_prompts_only:true/);
  assert.doesNotMatch(edge,/req\.json|req\.body/);
});
test('V192 database router is append-only, cooldown-aware and transport disabled by default',()=>{
  assert.match(sql,/gold_signal_alert_routes/);
  assert.match(sql,/append-only/);
  assert.match(sql,/SUPPRESSED_COOLDOWN/);
  assert.match(sql,/cooldown_minutes/);
  assert.match(sql,/values\('V192_ALERT_ROUTER_V1',50,80,15,false,'NONE'/);
  assert.match(sql,/historical_retrofit,false/);
  assert.match(sql,/action_permitted='WAIT'/);
  assert.match(sql,/capital_permission='0R'/);
  assert.match(sql,/priority_score_not_probability/);
});
