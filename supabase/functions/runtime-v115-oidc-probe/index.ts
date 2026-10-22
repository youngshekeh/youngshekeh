import {classifyOidcError} from './v249-oidc-policy.mjs';

const ISSUER='https://oidc.vercel.com/the-father';
const JWKS_URL='https://oidc.vercel.com/the-father/.well-known/jwks';
const AUDIENCE='https://vercel.com/the-father';
const SUBJECT='owner:the-father:project:the-father-analytics:environment:production';
const TEAM_ID='team_HHERLxuqURQTcRbBQj1TPIXo';
const PROJECT_ID='prj_WOGzSCTWULzGNgFGqVE5dFpg6anx';

let jwksCache:any=null;
let jwksAt=0;

function b64urlBytes(s:string){
  const pad='='.repeat((4-s.length%4)%4);
  const b64=(s+pad).replace(/-/g,'+').replace(/_/g,'/');
  const bin=atob(b64);
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
function b64urlJson(s:string){
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}
function constantTimeEqual(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function jwks(force=false){
  if(!force&&jwksCache&&Date.now()-jwksAt<15*60*1000)return jwksCache;
  let response;
  try{
    response=await fetch(JWKS_URL,{headers:{Accept:'application/json'},
      cache:'no-store',signal:AbortSignal.timeout(5000)});
  }catch{
    // Network/timeout of the public signing-key endpoint is never a bad JWT.
    throw new Error('jwks_unavailable');
  }
  if(!response.ok)throw new Error('jwks_unavailable');
  let keys;
  try{keys=await response.json()}catch{throw new Error('jwks_bad_response')}
  if(!keys||!Array.isArray(keys.keys))throw new Error('jwks_bad_response');
  jwksCache=keys;
  jwksAt=Date.now();
  return jwksCache;
}
async function verifyVercel(token:string){
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('token_format');
  const [h,p,sig]=parts;
  const header=b64urlJson(h),payload=b64urlJson(p);
  if(header?.alg!=='RS256'||!header?.kid)throw new Error('token_header');
  let set=await jwks();
  let jwk=(set?.keys||[]).find((k:any)=>k.kid===header.kid&&k.alg==='RS256');
  if(!jwk){
    // A 15-minute cache can miss newly rotated Vercel signing keys.
    // Fetch official JWKS ONCE again; never accept unverified signatures.
    set=await jwks(true);
    jwk=(set?.keys||[]).find((k:any)=>k.kid===header.kid&&k.alg==='RS256');
  }
  if(!jwk)throw new Error('signing_key_missing');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlBytes(sig),
    new TextEncoder().encode(h+'.'+p)
  );
  if(!valid)throw new Error('signature_invalid');

  const now=Math.floor(Date.now()/1000);
  const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
  if(payload.iss!==ISSUER)throw new Error('issuer_mismatch');
  if(!aud.includes(AUDIENCE))throw new Error('audience_mismatch');
  if(payload.sub!==SUBJECT)throw new Error('subject_mismatch');
  if(payload.owner!=='the-father'||payload.owner_id!==TEAM_ID)throw new Error('owner_mismatch');
  if(payload.project!=='the-father-analytics'||payload.project_id!==PROJECT_ID)throw new Error('project_mismatch');
  if(payload.environment!=='production')throw new Error('environment_mismatch');
  if(!Number.isFinite(Number(payload.exp))||Number(payload.exp)<=now)throw new Error('token_expired');
  if(Number.isFinite(Number(payload.nbf))&&Number(payload.nbf)>now+30)throw new Error('token_not_yet_valid');
  return payload;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET'){
    return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET'}});
  }

  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token){
    return Response.json({ok:false,state:'AUTH_MISSING'},{status:401,headers:{'Cache-Control':'no-store'}});
  }

  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(serviceRole&&constantTimeEqual(token,serviceRole)){
    return Response.json({
      ok:true,
      version:'v115-private-runtime-authz-v2',
      state:'SUPABASE_INTERNAL_SERVICE_ROLE_VERIFIED',
      governance:{authentication_only:true,capital_permission:'0R'}
    },{headers:{'Cache-Control':'no-store'}});
  }

  try{
    const payload=await verifyVercel(token);
    return Response.json({
      ok:true,
      version:'v115-private-runtime-authz-v2',
      state:'VERCEL_WORKLOAD_VERIFIED',
      issuer:payload.iss,
      audience:Array.isArray(payload.aud)?payload.aud:[payload.aud],
      subject:payload.sub,
      owner:payload.owner,
      owner_id:payload.owner_id,
      project:payload.project,
      project_id:payload.project_id,
      environment:payload.environment,
      expires_at:new Date(Number(payload.exp)*1000).toISOString(),
      governance:{authentication_only:true,capital_permission:'0R'}
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){
    const classified=classifyOidcError(e);
    // Only a coarse, constant safe failure category is emitted. Never tokens.
    console.warn('V249_OIDC_VERIFICATION_FAILURE',{state:classified.state,reason:classified.reason});
    return Response.json({
      ok:false,
      state:classified.state,
      reason:classified.reason,
      verifier_revision:'v249-jwks-refresh-failclosed-v1'
    },{status:classified.status,headers:{'Cache-Control':'no-store'}});
  }
});
