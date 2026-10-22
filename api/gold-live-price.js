// V230 standalone read-only proxy. Preserve V186's no-import fixture and public contract.
const UPSTREAM='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/broker-live-market-intake';
const GOVERNANCE={action_permitted:'WAIT',capital_permission:'0R',
  machine_execution_allowed:false,live_order_submission_enabled:false};
function strictV230Payload(status,body){
  return status===200&&body!==null&&typeof body==='object'
    &&!Array.isArray(body)&&body.ok===true;
}
function freshBrokerReadOnly(body,now=Date.now()){
  if(body?.live_broker?.state!=='BROKER_LIVE')return false;
  const q=body.live_broker.quote;
  if(!q||typeof q!=='object')return false;
  const ts=Date.parse(String(q.observed_at||''));
  if(!Number.isFinite(ts)||ts>now+1000||now-ts>5000)return false;
  if(typeof q.age_seconds!=='number'||!Number.isFinite(q.age_seconds)
    ||q.age_seconds<0||q.age_seconds>5)return false;
  const {bid,mid,ask}=q;
  return [bid,mid,ask].every(x=>typeof x==='number'&&Number.isFinite(x)&&x>0)
    &&bid<=mid&&mid<=ask;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Live-XAUUSD','V186');
  res.setHeader('X-TFA-Guard','V230');
  res.setHeader('X-TFA-Broker-Proof','NOT_VERIFIED');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,state:'UNAVAILABLE',error:'method_not_allowed',
      governance:{...GOVERNANCE}});
  }
  try{
    const response=await fetch(UPSTREAM,{method:'GET',
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V230-READ-ONLY/1.0'},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(3500)});
    const body=await response.json().catch(()=>null);
    if(!strictV230Payload(response.status,body))
      return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'live_xauusd_unavailable',
        governance:{...GOVERNANCE}});
    // 200 means status endpoint responded, not that MT5 is executing or even connected.
    if(freshBrokerReadOnly(body))res.setHeader('X-TFA-Broker-Proof','FRESH_READ_ONLY_MT5');
    return res.status(200).json(body);
  }catch{
    return res.status(503).json({ok:false,state:'UNAVAILABLE',error:'live_xauusd_unavailable',
      governance:{...GOVERNANCE}});
  }
}
