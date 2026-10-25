// V305 · Incident visibility using already retrieved launch-readiness evidence.
// Zero additional requests. Never infer SQL health from an HTTP reply or a stale flag.
import {freshEvidence} from './launch-readiness.mjs';
export function classifyPublicDatabaseIncident(readiness,now=Date.now()){
 const body=readiness?.data||{},response=readiness?.response;
 const current=response?.ok===true && body.ok===true &&
  freshEvidence(body.generated_at,now);
 const reported=current && body.database_incident?.active===true;
 const explicitlyClear=current && body.database_incident?.active===false;
 const state=reported?'DATABASE INCIDENT REPORTED · LAUNCH HOLD':
  explicitlyClear?'NO ACTIVE INCIDENT REPORTED · PRIVATE HEALTH NOT CERTIFIED':
  'DATABASE HEALTH NOT VERIFIED · LAUNCH HOLD';
 const detail=reported
  ?'The private readiness source reports a database incident. Public reference availability does not prove SQL connectivity, private engines, login, subscriptions or payment acceptance.'
  :explicitlyClear
  ?'No incident was reported in this recent readiness observation. This is not an independent SQL query, Auth login, broker quote, or production-release certification.'
  :'A current, authenticated database-health result is unavailable. Private service recovery and commercial release remain unverified.';
 return Object.freeze({state,detail,incident_reported:reported,
  incident_clear_claimed:explicitlyClear,source_current:current,
  certified:false,commercial_launch_allowed:false,
  capital_permission:'0R',action_permitted:'WAIT',
  live_order_submission_enabled:false,extra_private_requests:0});
}
