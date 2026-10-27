// V334 compute resize review ledger: NO API writes, secrets, browser automation,
// project changes or billing/trading actions. These are owner-attested inputs
// for independent human review, NOT trusted live-provider measurements.
// A green status from this offline evaluator never automatically deploys.
import {assessDatabaseTransportV329} from './v329-database-transport-evidence.mjs';

export const V334_PROJECT_REF='mpcelmjiycjpdyyflisn';
export const V334_SCHEMA='TFA-V334-NANO-MICRO-RESIZE-ACCEPTANCE';
const MAX_EVIDENCE_AGE=24*60*60*1000;

function trustedTime(x,now,maxAge=MAX_EVIDENCE_AGE){
 if(typeof x!=='string'||!x.trim()||x.length>60)return false;
 const t=Date.parse(x);
 return Number.isFinite(t)&&t<=now+30_000&&now-t>=0&&now-t<=maxAge;
}
function sameProject(o){
 return o?.project_ref===V334_PROJECT_REF;
}
function redactedBlockers(codes){return Object.freeze([...new Set(codes)]);}
const governance=Object.freeze({
 automatic_resize_permitted:false,
 automatic_restore_permitted:false,
 commercial_activation_permitted:false,
 merchant_charges_permitted:false,
 live_order_submission_permitted:false,
 capital_permission:'0R',
 action:'WAIT'
});

// Owner must confirm *actual* Dashboard/current billing state and backup
// inventory. A support email is a recommendation, not evidence that a tier
// was switched or that a project-specific backup exists.
export function assessNanoMicroPreflightV334({
 project,pricing,backup,operations
}={},now=Date.now()){
 const blockers=[];
 if(!sameProject(project)||project?.control_plane_status!=='ACTIVE_HEALTHY')
  blockers.push('PROJECT_IDENTITY_AND_STATE_NOT_VERIFIED');
 if(project?.compute_size!=='Nano'||project?.compute_source!=='OWNER_DASHBOARD'||
   !trustedTime(project?.observed_at,now))
  blockers.push('CURRENT_NANO_COMPUTE_NOT_DASHBOARD_VERIFIED');
 if(pricing?.source!=='OWNER_BILLING_CONFIRMATION'||pricing?.plan!=='Pro'||
   pricing?.nano_micro_same_rate!==true||pricing?.incremental_hourly_usd!==0||
   !trustedTime(pricing?.observed_at,now))
  blockers.push('BILLING_RATE_AND_CREDITS_NOT_VERIFIED');
 if(!sameProject(backup)||backup?.latest_backup_exists!==true||
   backup?.recoverable_point_reviewed!==true||
   backup?.restore_impact_reviewed!==true||
   !trustedTime(backup?.observed_at,now))
  blockers.push('REAL_PROJECT_BACKUP_AND_RESTORE_IMPACT_NOT_VERIFIED');
 if(operations?.owner_approved_downtime!==true||
   operations?.incident_reviewed!==true||
   operations?.recovery_rollback_owner_assigned!==true||
   !trustedTime(operations?.approved_at,now))
  blockers.push('OPERATOR_DOWNTIME_APPROVAL_MISSING');
 return Object.freeze({
   schema:V334_SCHEMA,phase:'PRE_RESIZE',
   state:blockers.length===0?'OWNER_REVIEW_POSSIBLE':'NO_RESIZE_YET',
   blockers:redactedBlockers(blockers),
   safe_to_auto_resize:false,
   project_ref:V334_PROJECT_REF,
   governance
 });
}

// A confirmed Micro setting does not certify service recovery. Even a
// fully green synthetic post-resize fixture only gives an operator a REVIEW
// candidate, never a paid product or a market-order activation.
export function assessNanoMicroPostflightV334({
 project,preflight,resize,transport,kernel
}={},now=Date.now()){
 const blockers=[];
 if(!sameProject(project)||project?.control_plane_status!=='ACTIVE_HEALTHY')
  blockers.push('PROJECT_CONTROL_PLANE_NOT_VERIFIED');
 if(!sameProject(resize)||resize?.compute_size!=='Micro'||
   resize?.source!=='OWNER_DASHBOARD'||resize?.completed!==true||
   !trustedTime(resize?.completed_at,now))
  blockers.push('MICRO_RESIZE_NOT_VERIFIED');
 if(preflight?.state!=='OWNER_REVIEW_POSSIBLE'||
   preflight?.schema!==V334_SCHEMA||
   preflight?.phase!=='PRE_RESIZE')
  blockers.push('PRE_RESIZE_SAFETY_EVIDENCE_MISSING');
 const checked=assessDatabaseTransportV329(transport,now);
 if(!checked.transport_ready_for_independent_review)
  blockers.push('CURRENT_SQL_REST_AND_LOG_STABILITY_NOT_PROVEN');
 const cycles=kernel?.cycles;
 const good=Array.isArray(cycles)&&cycles.length>=2&&cycles.length<=6&&
   cycles.every(c=>c?.signed_sealed_receipt_verified===true&&
    c?.dead_letter_count===0&&c?.consecutive_failures===0&&
    trustedTime(c?.completed_at,now,10*60_000))&&
   new Set(cycles.map(c=>c.receipt_id)).size===cycles.length&&
   cycles.every(c=>typeof c.receipt_id==='string'&&
      /^[A-Za-z0-9_-]{6,80}$/.test(c.receipt_id))&&
   Math.max(...cycles.map(c=>Date.parse(c.completed_at)))-
    Math.min(...cycles.map(c=>Date.parse(c.completed_at)))>=4*60_000;
 if(!good)blockers.push('TWO_HEALTHY_SEALED_KERNEL_CYCLES_MISSING');
 return Object.freeze({
  schema:V334_SCHEMA,phase:'POST_RESIZE',
  state:blockers.length===0?'POST_RESIZE_REVIEW_CANDIDATE':'RESIZE_ACCEPTANCE_HOLD',
  verified_compute_by_attestation:resize?.compute_size==='Micro'&&
   resize?.source==='OWNER_DASHBOARD'&&resize?.completed===true,
  blockers:redactedBlockers(blockers),
  transport_state:checked.state,
  project_ref:V334_PROJECT_REF,
  governance
 });
}
