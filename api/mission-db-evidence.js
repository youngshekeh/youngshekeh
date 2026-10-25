import {getVercelOidcToken} from '@vercel/oidc';
import {inspectSignedMissionDb} from '../src/v299-db-evidence-gate.mjs';
let inflight=null,cached=null,until=0;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-TFA-Recovery','V299-READ-ONLY');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed'});
 }
 if(cached&&Date.now()<until)return res.status(cached.ok?200:503).json(cached);
 if(!inflight)inflight=inspectSignedMissionDb({getToken:getVercelOidcToken})
 .then(v=>{cached={...v,observed_at:new Date().toISOString(),observation_ttl_seconds:90};
   until=Date.now()+90000;return cached})
 .finally(()=>{inflight=null});
 const result=await inflight;
 return res.status(result.ok?200:503).json(result);
}
