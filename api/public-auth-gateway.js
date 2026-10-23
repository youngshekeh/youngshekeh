import {collectAuthGateway} from '../src/auth-gateway-observability.mjs';
const PUBLIC_PROJECT_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const CACHE_TTL_MS=60000;
let recent=null,lastAt=0,pending=null;
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=30, stale-while-revalidate=30');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-TFA-Auth-Probe','V251-READ-ONLY-REACHABILITY');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');
  return res.status(405).json({ok:false,error:'method_not_allowed',
   governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}});
 }
 try{
  if(!recent||Date.now()-lastAt>=CACHE_TTL_MS){
   if(!pending)pending=collectAuthGateway({fetcher:fetch,key:PUBLIC_PROJECT_KEY}).then(v=>{
    recent=v;lastAt=Date.now();return v;
   }).finally(()=>{pending=null});
   await pending;
  }
  // Only source timestamps may indicate freshness; a cached status is not a new verification.
  return res.status(200).json(recent);
 }catch{
  return res.status(503).json({
   ok:false,state:'AUTH_PROBE_UNAVAILABLE',generated_at:new Date().toISOString(),
   truth:{auth_endpoint_reachable:false,commercial_launch_certified:false},
   governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false}
  });
 }
}
