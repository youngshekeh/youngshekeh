// V251: independent, read-only Supabase Auth *reachability* diagnostics.
// Never authorize account access or commercial launch from this observation.
export const AUTH_GATEWAY_DEADLINE_MS=4500;
export const AUTH_DIAGNOSTIC_STATE=Object.freeze({
 BOTH:'AUTH_ENDPOINTS_RESPONDING',HEALTH:'AUTH_HEALTH_ONLY',
 SETTINGS:'AUTH_SETTINGS_ONLY',NONE:'AUTH_ENDPOINTS_UNAVAILABLE'
});
const trimStatus=n=>Number.isInteger(n)&&n>=100&&n<=599?n:0;
export function summarizeAuthGateway(health,settings,{observedAt=new Date().toISOString()}={}){
 const normalize=v=>{
  const status=trimStatus(v?.status);
  return Object.freeze({ok:v?.ok===true&&status>=200&&status<300,status,
   transport:v?.transport==='TIMEOUT'?'TIMEOUT':v?.transport==='NETWORK_ERROR'?'NETWORK_ERROR':
      status?'HTTP_RESPONSE':'UNVERIFIED'});
 };
 const h=normalize(health),s=normalize(settings);
 const state=h.ok&&s.ok?AUTH_DIAGNOSTIC_STATE.BOTH:h.ok?AUTH_DIAGNOSTIC_STATE.HEALTH:s.ok?AUTH_DIAGNOSTIC_STATE.SETTINGS:AUTH_DIAGNOSTIC_STATE.NONE;
 // Only return the two explicitly public booleans. Never expose raw settings.
 const provider=s.ok?settings?.body?.external:null;
 return Object.freeze({
  ok:true,version:'v251-external-auth-gateway-reachability-v1',
  generated_at:observedAt,
  state,
  probe_location:'VERCEL_EXTERNAL_SUPABASE_AUTH',
  checks:Object.freeze({health:h,settings:s}),
  advertised_providers:Object.freeze({
   email:s.ok&&provider?.email===true?'ENABLED_REPORTED':'UNVERIFIED',
   google:s.ok&&provider?.google===true?'ENABLED_REPORTED':'UNVERIFIED'
  }),
  truth:Object.freeze({auth_endpoint_reachable:h.ok&&s.ok,
   browser_sign_in_verified:false,signup_verified:false,password_reset_verified:false,
   private_auth_entitlement_verified:false,billing_verified:false,
   database_incident_resolved:false,commercial_launch_certified:false}),
  governance:Object.freeze({action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false})
 });
}
export async function collectAuthGateway({fetcher,base='https://mpcelmjiycjpdyyflisn.supabase.co',key,deadlineMs=AUTH_GATEWAY_DEADLINE_MS,now=()=>new Date().toISOString()}={}){
 if(typeof fetcher!=='function')throw new TypeError('fetcher_required');
 if(typeof key!=='string'||!key.startsWith('sb_publishable_'))throw new TypeError('public_publishable_key_required');
 if(base!=='https://mpcelmjiycjpdyyflisn.supabase.co')throw new TypeError('fixed_supabase_origin_required');
 if(!Number.isInteger(deadlineMs)||deadlineMs<1000||deadlineMs>7000)throw new RangeError('invalid_timeout');
 const read=async(path)=>{
  const signal=AbortSignal.timeout(deadlineMs);
  try{
   const r=await fetcher(base+path,{method:'GET',headers:{apikey:key,Accept:'application/json'},
     cache:'no-store',redirect:'error',signal});
   let body=null;
   if(path.endsWith('/settings')&&r.ok)body=await r.json().catch(()=>null);
   return {ok:r.ok,status:r.status,transport:'HTTP_RESPONSE',body};
  }catch(err){
   return {ok:false,status:0,transport:err?.name==='TimeoutError'||signal.aborted?'TIMEOUT':'NETWORK_ERROR'};
  }
 };
 const [health,settings]=await Promise.all([read('/auth/v1/health'),read('/auth/v1/settings')]);
 return summarizeAuthGateway(health,settings,{observedAt:now()});
}
