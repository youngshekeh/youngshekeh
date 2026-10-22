import {verifyPublicGoldQuote} from '../src/public-gold-evidence.mjs';
import {normalizeReadOnlyGoldUpstream,V230_GOVERNANCE} from '../src/v230-launch-guards.mjs';
const UPSTREAM='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake';
// This remains a fixed, GET-only read path; never forwards user tokens or executes trades.
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Live-XAUUSD','V230');
  res.setHeader('X-TFA-Broker-Proof','NOT_VERIFIED');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,state:'UNAVAILABLE',error:'method_not_allowed',
      governance:{...V230_GOVERNANCE}});
  }
  try{
    const response=await fetch(UPSTREAM,{method:'GET',
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V230-READ-ONLY/1.0'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500)});
    const body=await response.json().catch(()=>null);
    const guarded=normalizeReadOnlyGoldUpstream(response.status,body);
    if(guarded.status!==200)return res.status(503).json(guarded.body);
    // HTTP 200 means the status endpoint responded, NOT that a broker quote is verified.
    const proof=verifyPublicGoldQuote({response:{ok:true},data:guarded.body});
    if(proof.verified)res.setHeader('X-TFA-Broker-Proof','FRESH_READ_ONLY_MT5');
    return res.status(200).json(guarded.body);
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'live_xauusd_unavailable',
      governance:{...V230_GOVERNANCE}});
  }
}
