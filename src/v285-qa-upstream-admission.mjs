import {TRIAGE_URL,assessProviderEdgeAdmission} from './v283-provider-edge-admission.mjs';

// V285: cheap, source-bound, read-only gate in front of private OIDC QA.
// A successful HTTP response is NOT kernel/QA/payment certification.
// Never obtain workload identity or start private QA when incident evidence is
// stale, contradictory or signals an active database incident.
import {QA_PREFLIGHT_TIMEOUT_MS,verifyQaDeadlineEnvelope} from './v296-qa-deadline-envelope.mjs';
if(!verifyQaDeadlineEnvelope().valid)throw new Error('qa_deadline_envelope_invalid');
const DEADLINE_MS=QA_PREFLIGHT_TIMEOUT_MS;
const notAdmitted=(reason)=>Object.freeze({admitted:false,reason,
  private_qa_certified:false,commercial_launch_certified:false,
  capital_permission:'0R'});

export async function preflightV285QaAdmission({fetcher=fetch,now=Date.now}={}){
  if(typeof fetcher!=='function')return notAdmitted('PREFLIGHT_READER_UNAVAILABLE');
  try{
    const response=await fetcher(TRIAGE_URL,{
      method:'GET',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',
      cache:'no-store',headers:{Accept:'application/json',
        'User-Agent':'TFA-V285-PRIVATE-QA-PREFLIGHT/1.0'},
      signal:AbortSignal.timeout(DEADLINE_MS)
    });
    const body=response.ok?await response.json().catch(()=>null):null;
    const verdict=assessProviderEdgeAdmission({
      ok:response.ok,status:response.status,body
    },now());
    return Object.freeze({admitted:verdict.admitted===true,
      reason:verdict.reason,private_qa_certified:false,
      commercial_launch_certified:false,capital_permission:'0R'});
  }catch{
    return notAdmitted('PREFLIGHT_TRANSPORT_UNAVAILABLE');
  }
}
