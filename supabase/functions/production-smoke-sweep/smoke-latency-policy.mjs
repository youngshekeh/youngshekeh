// V291 bounded public-core smoke request budgets.
// The V55 and V50 public aggregators can take longer than 3s on a cold cache.
// This is a deadline policy only: missing/late evidence MUST still fail.
export const SMOKE_CORE_MAX_DEADLINE_MS=12000;
export const SMOKE_CORE_DEFAULT_DEADLINE_MS=3000;
const SLOW_AGGREGATORS=Object.freeze([
  'public-v55-executive-market-board',
  'public-v50-production-integrity'
]);
export function smokeCoreTimeout(path){
  if(typeof path!=='string'||path.length>100||path.includes('/')||path.includes('?'))
    throw new Error('invalid_smoke_probe_path');
  return SLOW_AGGREGATORS.includes(path)
    ?SMOKE_CORE_MAX_DEADLINE_MS:SMOKE_CORE_DEFAULT_DEADLINE_MS;
}
