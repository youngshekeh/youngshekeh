import test from 'node:test';
import assert from 'node:assert/strict';
import {curateLedger,currentLedger} from '../src/forecast-ledger-health.mjs';
import {readLedger} from '../api/forecast-ledger-health.js';
const now=Date.UTC(2026,9,23,12);
const source=()=>({ok:true,generated_at:new Date(now).toISOString(),summary:{total_forecasts:7,open_forecasts:7,resolved_forecasts:0,brier_scored:0,directional_scored:0,avg_brier_score:0,verified_accuracy_available:true,directional_accuracy_pct:100}});
test('stored publication counts do not become Eye records or proven accuracy',()=>{
 const p=curateLedger(source(),now);assert.equal(p.counts.total,7);assert.equal(p.scoring_status,'NO_RESOLVED_OUTCOMES');assert.equal(p.performance,null);assert.equal(p.eye_capture,'NOT_CONNECTED');assert.equal(p.canonical_write_performed,false);
});
test('null, missing, fractional or inconsistent counts never become zero records',()=>{
 for(const alter of [s=>s.summary.total_forecasts=null,s=>delete s.summary.brier_scored,s=>s.summary.open_forecasts=1.2,s=>s.summary.resolved_forecasts=5,s=>s.summary.directional_scored=1]){const s=source();alter(s);const p=curateLedger(s,now);assert.equal(p.status,'UNAVAILABLE');assert.equal(p.counts,null);}
});
test('incident, stale or future evidence is withheld and expiry clears source counts',()=>{
 const p=curateLedger(source(),now);assert.ok(currentLedger(p,now+119999));assert.equal(currentLedger(p,now+120000),null);
 for(const s of [{...source(),state:'EVIDENCE_STORE_UNAVAILABLE'},{...source(),incident:{active:true}},{...source(),generated_at:new Date(now-120001).toISOString()},{...source(),generated_at:new Date(now+5001).toISOString()}])assert.equal(curateLedger(s,now).status,'UNAVAILABLE');
});
test('resolved aggregate counts still do not publish unverified performance',()=>{
 const s=source();Object.assign(s.summary,{open_forecasts:2,resolved_forecasts:5,brier_scored:5,directional_scored:5});const p=curateLedger(s,now);assert.equal(p.status,'PUBLICATION_COUNTS_AVAILABLE');assert.equal(p.performance,null);assert.equal(p.scoring_status,'OUTCOME_VALIDATION_REQUIRED');
});
test('read-only source adapter handles outage and validates source timestamp',async()=>{
 assert.equal((await readLedger({fetcher:async()=>new Response(JSON.stringify(source())),clock:()=>now})).counts.total,7);
 assert.equal((await readLedger({fetcher:async()=>new Response('',{status:503})})).counts,null);
 assert.equal((await readLedger({fetcher:async()=>{throw Error('outage')}})).status,'UNAVAILABLE');
});
