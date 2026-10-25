// V302.1 conservative 2-hour cron audit admission; no database or external actions.
export const CRON_AUDIT_WINDOW_MS=2*60*60*1000;
export const CRON_AUDIT_MAX_RUNS=1024;
export function admitRecentCronFailureCount({nowMs,boundaryMs,failedCount,inspectedRuns}={}){
 const timeValid=Number.isFinite(nowMs)&&Number.isFinite(boundaryMs)
  &&boundaryMs<nowMs-CRON_AUDIT_WINDOW_MS;
 const countValid=Number.isInteger(failedCount)&&failedCount>=0
  &&Number.isInteger(inspectedRuns)&&inspectedRuns>=0
  &&inspectedRuns<=CRON_AUDIT_MAX_RUNS&&failedCount<=inspectedRuns;
 const verified=timeValid&&countValid;
 return Object.freeze({ok:verified,state:verified?'COUNT_VERIFIED':'HOLD_INCOMPLETE_AUDIT',
  failed_2h:verified?failedCount:null,
  observed_runs:verified?inspectedRuns:null,capital_permission:'0R',
  action_permitted:'WAIT',commercial_launch_certified:false,
  private_engine_certified:false,can_self_promote:false});
}
