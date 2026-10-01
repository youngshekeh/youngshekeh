import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

export function verifyQaConcurrency(source) {
  assert(/async\s+function\s+tfaBoundedAll\s*\(/.test(source), 'Bounded QA worker helper missing');
  const calls = [...source.matchAll(/await\s+tfaBoundedAll\s*\(/g)];
  const limits = [...source.matchAll(/await\s+tfaBoundedAll\s*\(\[[\s\S]*?\],\s*(\d+)\s*\)/g)];
  assert(calls.length > 0 && calls.length === limits.length, 'Every QA fan-out must set an explicit concurrency limit');
  for (const match of limits) {
    const limit = Number(match[1]);
    assert(limit >= 1 && limit <= 8, `QA concurrency ${limit} exceeds the approved 1..8 range`);
  }
  assert(!/\]\s*=\s*await\s+Promise\.all\s*\(\[/.test(source), 'Unbounded primary QA fan-out still present');
  return limits.map(match => Number(match[1]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const source = readFileSync('supabase/functions/runtime-v115-autonomous-qa/index.ts', 'utf8');
  console.log(`QA concurrency verified: ${verifyQaConcurrency(source).join(', ')}; ceiling 8`);
}
