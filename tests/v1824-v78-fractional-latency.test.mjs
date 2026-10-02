import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(
  new URL('../supabase/migrations/20261002150410_fix_v78_fractional_latency_reconcile.sql',import.meta.url),
  'utf8'
);

test('V182.4 reconciler accepts fractional latency while preserving integer storage',()=>{
  assert.match(sql,/round\(nullif\(b#>>'\{summary,max_latency_ms\}',''\)::numeric\)::integer/);
  assert.doesNotMatch(sql,/nullif\(b#>>'\{summary,max_latency_ms\}',''\)::integer/);
  assert.match(sql,/security definer/i);
  assert.match(sql,/set search_path to 'public', 'net', 'extensions', 'pg_temp'/i);
});
