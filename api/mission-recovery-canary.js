import {getVercelOidcToken} from '@vercel/oidc';
import {inspectPrivateMissionRecovery} from '../src/v298-mission-recovery-canary.mjs';
let cached=null,until=0,inFlight=null;
// One process-local read-only observation per 90s; not a global traffic limiter.
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-TFA-Recovery-Canary','V298-READ-ONLY');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed'});
 }
 const now=Date.now();
 if(cached&&now<until)return res.status(cached.ok?200:503).json(cached);
 if(!inFlight)inFlight=inspectPrivateMissionRecovery({
  getToken:getVercelOidcToken
 }).then(x=>{cached=x;until=Date.now()+90000;return x})
   .finally(()=>{inFlight=null});
 const proof=await inFlight;
 return res.status(proof.ok?200:503).json(proof);
}
