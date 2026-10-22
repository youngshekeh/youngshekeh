// V231 diagnostic classification only. No database, billing, cron or execution writes.
export const V231_CRON_PHASE='4-59/5 * * * *';
export function classifyV231KernelIncident(kernel){
 const detail=String(kernel?.body?.detail||'').slice(0,200);
 const stage=kernel?.body?.stage;
 const explicitInvalidSeal=/v180_kernel_security_seal_missing|security_seal_verification_failed/i.test(detail);
 const timeout=kernel?.status===503&&stage==='KERNEL_SEAL'
   &&(/timed out|deadline|aborterror/i.test(detail));
 let code='PRIVATE_KERNEL_UNAVAILABLE';
 if(explicitInvalidSeal)code='SECURITY_SEAL_NOT_VERIFIED';
 else if(timeout)code='DATABASE_SEAL_TRANSPORT_TIMEOUT';
 else if(stage==='KERNEL_SEAL')code='KERNEL_SEAL_UNVERIFIED';
 return Object.freeze({version:'v231-kernel-admission-v1',code,
   seal_verified:false,recertification_required:true,
   database_scheduler_changed:false,reset_performed:false,
   governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}});
}
