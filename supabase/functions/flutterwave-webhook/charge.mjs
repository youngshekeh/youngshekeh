// V263: authenticated charge notifications use one atomic service-only RPC.
// Never call a charge-creation endpoint or accept transaction details from a redirect.
const PROVIDER_MS=7000,RPC_MS=12000;
const id=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0
 ?String(value):typeof value==='string'&&/^[1-9][0-9]{0,29}$/.test(value)?value:null;
const text=value=>typeof value==='string'?value:null;

// Bound headers AND body even when a provider ignores AbortSignal cancellation.
export async function boundedJson(url,init,timeoutMs,fetchImpl=fetch){
 const controller=new AbortController();let timer;
 try{
  return await Promise.race([
   (async()=>{
    const response=await fetchImpl(url,{...init,redirect:'error',cache:'no-store',signal:controller.signal});
    const data=await response.json();
    return {response,data};
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>{
    controller.abort();reject(new Error('webhook_dependency_deadline'));
   },timeoutMs)})
  ]);
 }finally{clearTimeout(timer);controller.abort()}
}

export function curateVerifiedTransaction(data,expectedId,now=Date.now()){
 if(id(data?.id)!==expectedId||data?.status!=='successful')return null;
 const amount=data.amount;
 if((typeof amount!=='number'&&typeof amount!=='string')
  ||!Number.isFinite(Number(amount))||Number(amount)<=0
  ||!/^[0-9]+(\.[0-9]+)?$/.test(String(amount)))return null;
 const customerId=id(data.customer?.id),email=text(data.customer?.email);
 const paidAt=Date.parse(text(data.created_at)||'');
 if(!customerId||!email||email.length>320||!text(data.tx_ref)||data.tx_ref.length>250
  ||!/^[A-Z]{3}$/.test(text(data.currency)||'')
  ||!Number.isFinite(paidAt)||paidAt>now+300000)return null;
 const meta={};
 for(const key of ['checkout_intent_id','user_id','plan_id']){
  if(data.meta?.[key]!=null){
   if(typeof data.meta[key]!=='string'||data.meta[key].length>250)return null;
   meta[key]=data.meta[key];
  }
 }
 const subscription=data.subscription_id==null?null:id(data.subscription_id);
 const plan=data.payment_plan==null?null:id(data.payment_plan);
 if((data.subscription_id!=null&&!subscription)||(data.payment_plan!=null&&!plan))return null;
 return {id:expectedId,tx_ref:data.tx_ref,status:'successful',amount:String(amount),
  currency:data.currency,created_at:new Date(paidAt).toISOString(),
  verified_at:new Date(now).toISOString(),customer:{id:customerId,email},
  subscription_id:subscription,...(plan?{payment_plan:plan}:{}),meta};
}

export async function fulfillVerifiedCharge({payload,base,key,flwKey,signatureMode,
 fetchImpl=fetch,now=Date.now,cors={}}){
 const reply=(status,state)=>Response.json({ok:status===200,state},
  {status,headers:{...cors,'Cache-Control':'no-store'}});
 const transactionId=id(payload?.data?.id);
 if(!transactionId)return reply(400,'INVALID_TRANSACTION_ID');
 try{
  const verified=await boundedJson(
   `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
   {method:'GET',headers:{Authorization:`Bearer ${flwKey}`,Accept:'application/json'}},PROVIDER_MS,fetchImpl);
  if(!verified.response.ok||verified.data?.status!=='success')return reply(503,'PROVIDER_VERIFICATION_UNAVAILABLE');
  const status=verified.data?.data?.status;
  if(status==='failed'||status==='cancelled')return reply(200,'UNSUCCESSFUL_PAYMENT_NO_ENTITLEMENT');
  if(status!=='successful')return reply(503,'PAYMENT_NOT_FINAL');
  const transaction=curateVerifiedTransaction(verified.data.data,transactionId,now());
  if(!transaction)return reply(409,'VERIFIED_TRANSACTION_REQUIRES_REVIEW');
  const committed=await boundedJson(`${base}/rest/v1/rpc/fulfill_flutterwave_charge`,
   {method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_verified:transaction,p_signature_mode:signatureMode})},RPC_MS,fetchImpl);
  const receipt=committed.data?.receipt;
  if(!committed.response.ok)return reply(503,'FULFILLMENT_NOT_COMMITTED');
  if(committed.data?.ok!==true)return reply(409,'FULFILLMENT_REQUIRES_REVIEW');
  if(!['COMMITTED','ALREADY_COMMITTED'].includes(committed.data.state)
   ||receipt?.atomic_fulfillment_committed!==true
   ||receipt?.event_dedupe_record_committed!==true
   ||receipt?.entitlement_upsert_committed!==true)return reply(503,'FULFILLMENT_RECEIPT_INVALID');
  // The private receipt contains member evidence and is never exposed here.
  return reply(200,committed.data.state);
 }catch{
  // Non-200 lets the provider retry. Never log secrets, customer data or bodies.
  return reply(503,'WEBHOOK_DEPENDENCY_UNAVAILABLE');
 }
}
