// V224: Prevent public status views from triggering a costly private QA suite
// when any independently required low-cost launch prerequisite already fails.
// Admission never certifies QA, OIDC or the V180 kernel itself.
import {evaluateLaunchReadiness} from './launch-readiness.mjs';
export const QA_PREREQUISITES=Object.freeze([
  'auth','final_acceptance','billing','public_gold_data'
]);
export function assessQaAdmission({auth,readiness,billing,gold}={},now=Date.now()){
  const snapshot=evaluateLaunchReadiness({auth,readiness,billing,gold},now);
  const missing=QA_PREREQUISITES.filter(k=>snapshot.checks[k]!==true);
  return Object.freeze({
    admitted:missing.length===0,
    reason:missing.length===0?'PRECHECKS_VERIFIED':'PREREQUISITES_UNHEALTHY',
    blockers:Object.freeze(missing),
    private_qa_certified:false,
    workload_identity_certified:false,
    continuous_kernel_certified:false
  });
}
