// V249: never classify unverified token claims as transport success.
const transport=new Set(['jwks_unavailable','jwks_transport_timeout','jwks_bad_response']);
export function classifyOidcError(error){
 const reason=String(error?.message||error||'unknown').slice(0,120);
 const unavailable=transport.has(reason);
 return Object.freeze({
  state:unavailable?'AUTH_VERIFIER_UNAVAILABLE':'AUTH_REJECTED',
  status:unavailable?503:401,
  reason:unavailable?'JWKS_TRANSPORT_UNAVAILABLE':'TOKEN_OR_CLAIMS_REJECTED',
  verified:false
 });
}
export async function verifyOidcProbeWithBoundedRetry(read){
 if(typeof read!=='function')throw new TypeError('read_probe_required');
 const first=await read();
 if(first?.status!==503)return first;
 // A provider outage may be retried once; explicit 401 never retried.
 return await read();
}
