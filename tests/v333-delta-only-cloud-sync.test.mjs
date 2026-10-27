import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
 v333PendingLocalChanges,V333_REMOTE_PAGE_BOUNDARY,
 V333_MAX_WRITE_ROWS
} from '../src/v333-delta-only-cloud-sync.mjs';
const source=readFileSync(new URL('../src/command-os.js',import.meta.url),'utf8');
const at='2026-10-27T10:25:00.000Z';
const now=Date.parse(at),ts=seconds=>new Date(now-seconds*1000).toISOString();
const row=(id,age=10,attrs={})=>({id,updatedAt:ts(age),createdAt:ts(age+60),title:id,...attrs});
const select=(local,remote,opts={})=>v333PendingLocalChanges(local,remote,{now,...opts});
test('unchanged seven-table cloud data produces zero SQL write candidates',()=>{
 for(let i=0;i<7;i++){
  const local=[row('same'),row('same-two')];
  const res=select(local,[...local.map(x=>({...x}))]);
  assert.equal(res.would_write,0);
  assert.equal(res.pending.length,0);
  assert.equal(res.no_full_collection_replay,true);
 }
});
test('only brand-new local records are scheduled for upsert',()=>{
 const remote=[row('remote-one'),row('also-remote')];
 const local=[...remote,row('local-new',2)];
 const res=select(local,remote);
 assert.deepEqual(res.pending.map(x=>x.id),['local-new']);
 assert.equal(res.unchanged_or_remote_wins,2);
});
test('locally newer timestamp wins only for changed matching ID',()=>{
 const remote=[row('id-1',200),row('id-2',50)];
 const local=[row('id-1',1),row('id-2',70)];
 const res=select(local,remote);
 assert.deepEqual(res.pending.map(x=>x.id),['id-1']);
});
test('remote newer than local remains authoritative, never overwritten',()=>{
 const res=select([row('x',60)],[row('x',1)]);
 assert.equal(res.would_write,0);
 assert.equal(res.capital_permission,'0R');
});
test('equal timestamps never POST or update remote on polling',()=>{
 const res=select([row('x',5)],[row('x',5)]);
 assert.equal(res.pending.length,0);
});
test('unknown local time does not overwrite a valid remote record',()=>{
 const res=select([{id:'x',title:'old'}],[row('x',1)]);
 assert.equal(res.would_write,0);
});
test('missing timestamps on new local data block rather than create invented time',()=>{
 assert.throws(()=>select([{id:'missing',title:'unsaved'}],[]),
   /CLOUD_LOCAL_TIMESTAMP_UNVERIFIED/);
});
test('unverified server timestamp blocks overwrites rather than assume server is stale',()=>{
 assert.throws(()=>select([row('x',1)],[{id:'x',updatedAt:'not-a-date'}]),
   /CLOUD_REMOTE_TIMESTAMP_UNVERIFIED/);
});
test('unverified future local timestamps cannot override present remote truth',()=>{
 const res=select([row('x',-200)],[row('x',20)]);
 assert.equal(res.would_write,0);
});
test('remote PostgREST result at 1,000-row boundary is not a complete snapshot',()=>{
 const remote=Array.from({length:V333_REMOTE_PAGE_BOUNDARY},(_,i)=>row('remote-'+i));
 assert.throws(()=>select([row('new')],remote),
   /CLOUD_REMOTE_SNAPSHOT_PAGINATION_UNVERIFIED/);
});
test('duplicate server identities never permit ambiguous upsert',()=>{
 assert.throws(()=>select([row('x')],[row('x'),row('x')]),
   /CLOUD_REMOTE_ID_INVALID_OR_DUPLICATE/);
});
test('duplicate local IDs cannot write conflicting updates',()=>{
 assert.throws(()=>select([row('x'),row('x')],[]),
   /CLOUD_LOCAL_ID_INVALID_OR_DUPLICATE/);
});
test('malformed remote IDs and local IDs fail closed',()=>{
 for(const r of [null,{id:''},{id:123}]){
  assert.throws(()=>select([row('x')],[r]),/CLOUD_REMOTE_ID_INVALID_OR_DUPLICATE/);
  assert.throws(()=>select([r],[]),/CLOUD_LOCAL_ID_INVALID_OR_DUPLICATE/);
 }
});
test('more than 100 writes need review instead of an unbounded POST body',()=>{
 assert.equal(V333_MAX_WRITE_ROWS,100);
 assert.throws(()=>select(Array.from({length:101},(_,i)=>row('n-'+i)),[]),
   /CLOUD_DELTA_TOO_LARGE_REVIEW_REQUIRED/);
});
test('custom limits may tighten but never expand 100-row safe maximum',()=>{
 assert.throws(()=>select([row('n')],[],{limit:101}),/CLOUD_SYNC_INVALID_INPUT/);
 assert.throws(()=>select([row('n'),row('m')],[],{limit:1}),/CLOUD_DELTA_TOO_LARGE/);
});
test('source input arrays and item identities are not mutated or erased',()=>{
 const original=[row('one'),row('two')],cloud=[row('one',300)];
 const old=JSON.stringify(original),before=JSON.stringify(cloud);
 const x=select(original,cloud);
 assert.equal(JSON.stringify(original),old);
 assert.equal(JSON.stringify(cloud),before);
 assert.strictEqual(x.pending[0],original[0]);
 assert.ok(Object.isFrozen(x.pending));
});
test('decision sync no longer bulk-upserts a merged full ledger',()=>{
 assert.match(source,/const pending=v333PendingLocalChanges\(state\.ledger,remote\)\.pending/);
 assert.match(source,/await upsertCloud\(pending\)/);
 assert.doesNotMatch(source,/await upsertCloud\(state\.ledger\)/);
 assert.match(source,/async function syncItemToCloud/);
});
test('all eight cloud collections calculate only vetted pending local deltas',()=>{
 for(const marker of [
  'pendingObjectives=v333PendingLocalChanges(state.org.objectives,remoteObjectives)',
  'pendingProjects=v333PendingLocalChanges(state.org.projects,remoteProjects)',
  'pendingUnits=v333PendingLocalChanges(state.biz.units,remoteUnits)',
  'pendingProducts=v333PendingLocalChanges(state.biz.products,remoteProducts)',
  'pendingChannels=v333PendingLocalChanges(state.biz.channels,remoteChannels)',
  'pendingAllocations=v333PendingLocalChanges(state.allocations,rows)',
  'pendingOutcomes=v333PendingLocalChanges(state.outcomes,remote)',
  'pending=v333PendingLocalChanges(state.ledger,remote)'
 ])assert.ok(source.includes(marker),'Missing '+marker);
 for(const unsafe of [
  'upsertCloud(state.ledger)',
  'upsertOrgRows(\'command_business_units\',\'user_id,client_business_id\',state.biz.units.map(toBizRow))',
  'upsertOrgRows(\'command_resource_allocations\',\'user_id,client_allocation_id\',state.allocations.map(allocationToCloud))',
 ])assert.ok(!source.includes(unsafe),'Still full-collection rewrite '+unsafe);
});
test('new policy has no network calls, broker access, database mutation, or trading',()=>{
 const src=readFileSync(new URL('../src/v333-delta-only-cloud-sync.mjs',
  import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bfetch\s*\(|\bINSERT\s+INTO\b|cron\.schedule|order_send|pg_terminate_backend|service_role|checkout\s*=/i);
 const a=select([row('a')],[]);
 assert.equal(a.commercial_activation_permitted,false);
 assert.equal(a.trading_activation_permitted,false);
 assert.equal(a.capital_permission,'0R');
});
test('actual decision sync makes no full-collection POST with unchanged remote records',async()=>{
 // Run the exact deployed-branch function body in a synthetic VM with
 // fake cloud auth, merge and persistence. Never touch live Supabase.
 const start=source.indexOf('async function syncCloudMemory(){');
 const end=source.indexOf('\nfunction renderOrgCloudState()',start);
 assert.ok(start>=0&&end>start);
 const actual=source.slice(start,end);
 const writes=[],saved=[];
 const cloud=[{id:'x',title:'server truth',updatedAt:ts(1),createdAt:ts(300)}];
 const ctx={
  state:{cloud:{token:'mock',userId:'owner-fixture',state:'LOCAL_ONLY'},
    ledger:[row('x',90),row('new-local',3)]},
  verifyCloudSession:async()=>true,
  renderCloudState(){},renderAll(){},saveLedger(){saved.push(true)},
  cloudRows:async()=>cloud.map(x=>({...x})),
  fromCloudRow:x=>x,
  cloudTimestamp:x=>Date.parse(x.updatedAt||x.createdAt||'')||0,
  upsertCloud:async pending=>writes.push(pending.map(x=>x.id)),
  v333PendingLocalChanges:(local,remote)=>select(local,remote),
  Date,Map,JSON,Object,String
 };
 const run=runInNewContext(actual+'\n;syncCloudMemory',ctx,{timeout:3000});
 await run();
 assert.deepEqual(writes,[['new-local']]);
 assert.equal(ctx.state.ledger.find(x=>x.id==='x').title,'server truth');
 assert.equal(ctx.state.cloud.state,'CLOUD_SYNCED');
 assert.equal(saved.length,1);
 await run();
 // Identical remote second poll must not send more than local new item
 // until the authenticated read returns an acknowledgement of persistence.
 assert.deepEqual(writes,[['new-local'],['new-local']]);
});
