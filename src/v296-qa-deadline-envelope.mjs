// V296 bounded private QA deadline envelope.
// Cold public recovery triage can spend up to 9000ms reading readiness.
// Admission remains strict: extra time never changes a rejected response into success.
export const QA_TRIAGE_COLDEST_SOURCE_MS=9000;
export const QA_PREFLIGHT_TIMEOUT_MS=10500;
export const QA_PRIVATE_UPSTREAM_TIMEOUT_MS=30000;
export const QA_PGNET_TIMEOUT_MS=45000;
export const QA_VERCEL_MAX_DURATION_SECONDS=50;
export const QA_MIN_OUTER_RESERVE_MS=4000;

export function verifyQaDeadlineEnvelope({
 triage=QA_TRIAGE_COLDEST_SOURCE_MS,
 preflight=QA_PREFLIGHT_TIMEOUT_MS,
 upstream=QA_PRIVATE_UPSTREAM_TIMEOUT_MS,
 pgnet=QA_PGNET_TIMEOUT_MS,
 vercel=QA_VERCEL_MAX_DURATION_SECONDS*1000
}={}){
 const values=[triage,preflight,upstream,pgnet,vercel];
 const valid=values.every(x=>Number.isInteger(x)&&x>0&&x<=60000);
 const ordered=valid&&triage<preflight
  &&preflight+upstream+QA_MIN_OUTER_RESERVE_MS<=pgnet
  &&pgnet+QA_MIN_OUTER_RESERVE_MS<=vercel;
 return Object.freeze({valid:ordered,
  triage_only_readonly:true,parallel_retries_added:0,
  private_qa_certified:false,commercial_launch_certified:false,
  capital_permission:'0R'});
}
