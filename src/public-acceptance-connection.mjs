// These three endpoints are already anonymous, read-only public observations.
// Their CORS policies do not all allow apikey. Use a simple credentialless GET
// so a browser preflight cannot hide a recovered service behind UNAVAILABLE.
const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
const PATHS=new Set([
 'public-final-readiness','public-auth-runtime-check','public-billing-acceptance'
]);
export function publicAcceptanceDeadline(path){return path==='public-final-readiness'?30000:18000;}
export function createPublicAcceptanceReader({fetchImpl=globalThis.fetch,timeoutMs}={}){
 if(typeof fetchImpl!=='function'||(timeoutMs!==undefined&&(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)))
  throw new TypeError('public_acceptance_reader_config_invalid');
 const pending=new Map();
 return async function readPublicAcceptance(path){
  if(!PATHS.has(path))throw new TypeError('unknown_public_acceptance_route');
  // Coalesce only concurrent reads; never cache or re-date acceptance evidence.
  if(pending.has(path))return pending.get(path);
  const task=(async()=>{
   const response=await fetchImpl(BASE+path,{
    method:'GET',headers:{Accept:'application/json'},credentials:'omit',
    mode:'cors',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(timeoutMs??publicAcceptanceDeadline(path))
   });
   const data=await response.json().catch(()=>({ok:false,state:'INVALID_RESPONSE'}));
   return {response,data};
  })();
  pending.set(path,task);
  try{return await task}finally{if(pending.get(path)===task)pending.delete(path)}
 };
}
export const readPublicAcceptance=createPublicAcceptanceReader();
