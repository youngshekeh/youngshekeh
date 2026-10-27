import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 assessNanoMicroPreflightV334,assessNanoMicroPostflightV334,
 V334_PROJECT_REF,V334_SCHEMA
} from '../src/v334-micro-compute-upgrade-acceptance.mjs';
const now=Date.parse('2026-10-27T11:00:00.000Z');
const at=minutes=>new Date(now-minutes*60_000).toISOString();
const project=()=>({project_ref:V334_PROJECT_REF,control_plane_status:'ACTIVE_HEALTHY',
 compute_size:'Nano',compute_source:'OWNER_DASHBOARD',observed_at:at(1)});
const pricing=()=>({source:'OWNER_BILLING_CONFIRMATION',plan:'Pro',
 nano_micro_same_rate:true,incremental_hourly_usd:0,observed_at:at(1)});
const backup=()=>({project_ref:V334_PROJECT_REF,latest_backup_exists:true,
 recoverable_point_reviewed:true,restore_impact_reviewed:true,
 observed_at:at(3)});
const operations=()=>({owner_approved_downtime:true,
 incident_reviewed:true,recovery_rollback_owner_assigned:true,approved_at:at(1)});
const pf=()=>({project:project(),pricing:pricing(),backup:backup(),operations:operations()});
const policy=a=>assessNanoMicroPreflightV334(a,now);
const metrics=()=>({
 postgres_cancelled_57014:0,postgres_connection_08006:0,
 postgres_protocol_08P01:0,postgrest_timeout_events:0,
 postgrest_pooler_errors:0,supavisor_auth_timeouts:0,
 management_sql_connect_timeouts:0
});
const sql=(id,mins)=>({source:'SUPABASE_MANAGEMENT_SQL',check:'SELECT_NOW',
 probe_id:id,ok:true,observed_at:at(mins),database_time:at(mins),error:null});
const post=()=>({
 project:{project_ref:V334_PROJECT_REF,control_plane_status:'ACTIVE_HEALTHY'},
 preflight:policy(pf()),
 resize:{project_ref:V334_PROJECT_REF,compute_size:'Micro',
  source:'OWNER_DASHBOARD',completed:true,completed_at:at(9)},
 transport:{
  snapshot:{window_start:at(9),window_end:at(1),
   collected_at:at(0.5),sources:['postgres_logs','postgrest_logs','supavisor_logs'],
   log_query_complete:true,redacted:true,metrics:metrics()},
  management_sql_samples:[sql('before',3),sql('after',1)],
  postgrest_probe:{ok:true,schema_cache_ready:true,
    authenticated_read_only:true,observed_at:at(0.5)},
  control_plane:{status:'ACTIVE_HEALTHY'}
 },
 kernel:{cycles:[
  {receipt_id:'kernel_first',signed_sealed_receipt_verified:true,
   dead_letter_count:0,consecutive_failures:0,completed_at:at(6)},
  {receipt_id:'kernel_second',signed_sealed_receipt_verified:true,
   dead_letter_count:0,consecutive_failures:0,completed_at:at(1)}
 ]}
});
test('no evidence from dashboard means no resize, never automatic action',()=>{
 const r=policy({});
 assert.equal(r.schema,V334_SCHEMA);
 assert.equal(r.state,'NO_RESIZE_YET');
 assert.equal(r.safe_to_auto_resize,false);
 assert.equal(r.governance.automatic_resize_permitted,false);
 assert.equal(r.governance.commercial_activation_permitted,false);
 assert.equal(r.governance.capital_permission,'0R');
});
test('support email alone is advice, not tier/backups validation',()=>{
 const r=policy({project:{control_plane_status:'ACTIVE_HEALTHY'},
  pricing:{plan:'Pro',nano_micro_same_rate:true}});
 assert.equal(r.state,'NO_RESIZE_YET');
 assert.ok(r.blockers.includes('CURRENT_NANO_COMPUTE_NOT_DASHBOARD_VERIFIED'));
 assert.ok(r.blockers.includes('REAL_PROJECT_BACKUP_AND_RESTORE_IMPACT_NOT_VERIFIED'));
});
test('preflight can reach owner REVIEW only when all independent attestation present',()=>{
 const r=policy(pf());
 assert.equal(r.state,'OWNER_REVIEW_POSSIBLE');
 assert.equal(r.blockers.length,0);
 assert.equal(r.safe_to_auto_resize,false);
});
test('wrong project or missing project state always blocks',()=>{
 const f=pf();f.project.project_ref='wrong';
 assert.ok(policy(f).blockers.includes('PROJECT_IDENTITY_AND_STATE_NOT_VERIFIED'));
});
test('current compute must be Nano directly seen in Dashboard',()=>{
 for(const size of ['Micro','Small','unknown',null]){
  const f=pf();f.project.compute_size=size;
  assert.ok(policy(f).blockers.includes('CURRENT_NANO_COMPUTE_NOT_DASHBOARD_VERIFIED'));
 }
 const f=pf();f.project.compute_source='SUPPORT_EMAIL';
 assert.ok(policy(f).blockers.includes('CURRENT_NANO_COMPUTE_NOT_DASHBOARD_VERIFIED'));
});
test('Pro parity does not equate to project-specific billing acknowledgement',()=>{
 for(const delta of [0.01,1,null,'0']){
  const f=pf();f.pricing.incremental_hourly_usd=delta;
  assert.ok(policy(f).blockers.includes('BILLING_RATE_AND_CREDITS_NOT_VERIFIED'));
 }
});
test('operator must verify project backup inventory and restore impact',()=>{
 const f=pf();f.backup.latest_backup_exists=false;
 assert.ok(policy(f).blockers.includes('REAL_PROJECT_BACKUP_AND_RESTORE_IMPACT_NOT_VERIFIED'));
 const b=pf();b.backup.restore_impact_reviewed=false;
 assert.ok(policy(b).blockers.includes('REAL_PROJECT_BACKUP_AND_RESTORE_IMPACT_NOT_VERIFIED'));
});
test('operator must approve planned downtime, review incident, assign rollback owner',()=>{
 for(const key of ['owner_approved_downtime','incident_reviewed','recovery_rollback_owner_assigned']){
  const f=pf();f.operations[key]=false;
  assert.ok(policy(f).blockers.includes('OPERATOR_DOWNTIME_APPROVAL_MISSING'));
 }
});
test('stale or future attestation cannot be reused as new resize approval',()=>{
 const old=pf();old.backup.observed_at=at(1500);
 assert.ok(policy(old).blockers.includes('REAL_PROJECT_BACKUP_AND_RESTORE_IMPACT_NOT_VERIFIED'));
 const future=pf();future.operations.approved_at=new Date(now+10*60_000).toISOString();
 assert.ok(policy(future).blockers.includes('OPERATOR_DOWNTIME_APPROVAL_MISSING'));
});
test('simulated fully green post-resize never unlocks checkout or trades',()=>{
 const r=assessNanoMicroPostflightV334(post(),now);
 assert.equal(r.schema,V334_SCHEMA);
 assert.equal(r.state,'POST_RESIZE_REVIEW_CANDIDATE');
 assert.equal(r.transport_state,'TRANSPORT_EVIDENCE_REVIEWABLE');
 assert.equal(r.governance.merchant_charges_permitted,false);
 assert.equal(r.governance.live_order_submission_permitted,false);
 assert.equal(r.governance.automatic_restore_permitted,false);
 assert.equal(r.governance.capital_permission,'0R');
});
test('Micro upgrade not completed in owner Dashboard means HOLD',()=>{
 const x=post();x.resize.compute_size='Nano';
 assert.ok(assessNanoMicroPostflightV334(x,now).blockers.includes('MICRO_RESIZE_NOT_VERIFIED'));
});
test('missing or unsigned kernel cycles hold despite fresh SQL',()=>{
 const x=post();x.kernel.cycles[0].signed_sealed_receipt_verified=false;
 assert.ok(assessNanoMicroPostflightV334(x,now).blockers.includes('TWO_HEALTHY_SEALED_KERNEL_CYCLES_MISSING'));
});
test('two identical kernel receipts never count as two real cycles',()=>{
 const x=post();x.kernel.cycles[1].receipt_id='kernel_first';
 assert.ok(assessNanoMicroPostflightV334(x,now).blockers.includes('TWO_HEALTHY_SEALED_KERNEL_CYCLES_MISSING'));
});
test('two too closely spaced kernel receipts do not demonstrate sustained health',()=>{
 const x=post();x.kernel.cycles[0].completed_at=at(3);
 assert.ok(assessNanoMicroPostflightV334(x,now).blockers.includes('TWO_HEALTHY_SEALED_KERNEL_CYCLES_MISSING'));
});
test('one SQL success, even on Micro, does not pass transport review',()=>{
 const x=post();x.transport.management_sql_samples=[sql('only',1)];
 const r=assessNanoMicroPostflightV334(x,now);
 assert.equal(r.state,'RESIZE_ACCEPTANCE_HOLD');
 assert.ok(r.blockers.includes('CURRENT_SQL_REST_AND_LOG_STABILITY_NOT_PROVEN'));
});
test('PostgREST timeouts following compute change remain launch-blocking',()=>{
 const x=post();x.transport.snapshot.metrics.postgrest_timeout_events=9;
 const r=assessNanoMicroPostflightV334(x,now);
 assert.equal(r.state,'RESIZE_ACCEPTANCE_HOLD');
});
test('missing Supavisor source cannot be mistaken for clean log window',()=>{
 const x=post();x.transport.snapshot.sources=['postgres_logs','postgrest_logs'];
 const r=assessNanoMicroPostflightV334(x,now);
 assert.equal(r.state,'RESIZE_ACCEPTANCE_HOLD');
});
test('security and merchant locks stay intact even for completely successful synthetic fixture',()=>{
 const x=post();const r=assessNanoMicroPostflightV334(x,now);
 assert.equal(r.governance.automatic_resize_permitted,false);
 assert.equal(r.governance.automatic_restore_permitted,false);
 assert.equal(r.governance.commercial_activation_permitted,false);
 assert.equal(r.governance.live_order_submission_permitted,false);
});
test('V334 source cannot send credentials, mutate infrastructure or activate money',()=>{
 const src=readFileSync(new URL('../src/v334-micro-compute-upgrade-acceptance.mjs',import.meta.url),'utf8');
 for(const token of ['fetch(','pg_terminate_backend','ALTER SYSTEM','supabase.service_role',
   'PATCH /v1/','upsert(', 'order_send(']){
   assert.ok(!src.includes(token),'forbidden side effect '+token);
 }
});
