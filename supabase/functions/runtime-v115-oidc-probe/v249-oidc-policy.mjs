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

export async function selectVercelSigningKey({kid,load}={}){
 if(typeof kid!=='string'||!kid||typeof load!=='function')throw new Error('invalid_key_lookup');
 const select=set=>Array.isArray(set?.keys)?set.keys.find(key=>key?.kid===kid&&key?.alg==='RS256'):undefined;
 let selected=select(await load(false));
 if(!selected)selected=select(await load(true));
 if(!selected)throw new Error('signing_key_missing');
 return selected;
}
