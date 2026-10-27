// V320 REVIEW ONLY: replacement candidate for deployed
// reconcile-flutterwave-payments v4. Never deploy without merchant and backup
// acceptance. No customer, merchant or subscription mutations in this version.
// Anonymous responses contain only counts. NO ledger or agent_runs writes.
const MAX_SCAN=25;
const MAX_PROVIDER_PAGES=3;
const MAX_PROVIDER_WAIT_MS=6000;
const CORS={
  'Access-Control-Allow-Origin':'https://thefatheranalytics.com',
  'Access-Control-Allow-Headers':'content-type, x-tfa-cron-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'private, no-store'
};
function secretKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{
    const b=JSON.parse(bundle);
    if(typeof b?.default==='string'&&b.default)return b.default;
  }catch{}}
  const k=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!k)throw new Error('service_role_key_unavailable');
  return k;
}
async function hash(text:string){
  const a=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
}
function url(base:string,table:string,params:Record<string,string>){
  const u=new URL(base+'/rest/v1/'+table);
  for(const [key,value] of Object.entries(params))u.searchParams.set(key,value);
  return u.href;
}
async function getJson(endpoint:string,headers:Record<string,string>,timeoutMs=MAX_PROVIDER_WAIT_MS){
  const res=await fetch(endpoint,{
    method:'GET',headers,cache:'no-store',
    redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  if(!res.ok)throw new Error('upstream_read_unavailable');
  const data=await res.json().catch(()=>null);
  if(data===null)throw new Error('invalid_upstream_json');
  return data;
}
function safeRef(value:unknown){
  return typeof value==='string'
    &&value.length>0&&value.length<=190
    &&/^[a-zA-Z0-9:._-]+$/.test(value);
}
function validTransactionId(value:unknown){
  return /^[1-9][0-9]{0,17}$/.test(String(value??''));
}
async function providerProof(intent:any,key:string){
  if(!safeRef(intent?.provider_reference)
    ||typeof intent?.currency!=='string'
    ||!Number.isFinite(Number(intent?.amount))
    ||Number(intent.amount)<=0)
      return 'INCOMPLETE_LOCAL_EVIDENCE';
  const params={
    from:'2020-01-01',
    to:new Date().toISOString().slice(0,10),
    tx_ref:intent.provider_reference,
    status:'successful'
  };
  let candidate:any=null;
  let exhausted=false;
  for(let page=1;page<=MAX_PROVIDER_PAGES;page++){
    const u=new URL('https://api.flutterwave.com/v3/transactions');
    for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
    u.searchParams.set('page',String(page));
    const data=await getJson(u.href,{Authorization:'Bearer '+key,Accept:'application/json'});
    if(data?.status!=='success'||!Array.isArray(data?.data))
      throw new Error('provider_list_contract_unverified');
    const found=data.data.filter((x:any)=>x?.tx_ref===intent.provider_reference
      &&x?.status==='successful'&&validTransactionId(x?.id));
    if(found.length>1)return 'MULTIPLE_PROVIDER_MATCHES_MANUAL_HOLD';
    if(found.length===1){
      if(candidate&&String(candidate.id)!==String(found[0].id))
        return 'MULTIPLE_PROVIDER_MATCHES_MANUAL_HOLD';
      candidate=found[0];
    }
    const p=data?.meta?.page_info;
    const total=Number(p?.total_pages);
    if(!Number.isInteger(total)||total<1||total>100000)
      return 'UNVERIFIED_PAGINATION_MANUAL_HOLD';
    if(page>=total){exhausted=true;break;}
  }
  if(!exhausted)return 'PAGINATION_INCOMPLETE_MANUAL_HOLD';
  if(!candidate)return 'NO_CONFIRMED_PROVIDER_PAYMENT';
  const confirmation=await getJson(
    'https://api.flutterwave.com/v3/transactions/'+encodeURIComponent(String(candidate.id))+'/verify',
    {Authorization:'Bearer '+key,Accept:'application/json'}
  );
  const tx=confirmation?.data;
  if(confirmation?.status!=='success'
    ||!tx||String(tx.id)!==String(candidate.id)
    ||tx.tx_ref!==intent.provider_reference
    ||tx.status!=='successful'
    ||!Number.isFinite(Number(tx.amount))
    ||Number(tx.amount)<Number(intent.amount)
    ||String(tx.currency??'').toUpperCase()!==String(intent.currency).toUpperCase())
      return 'PROVIDER_PARITY_MANUAL_HOLD';
  return 'VERIFIED_SUCCESS_MANUAL_COMMIT_REQUIRED';
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')
    return new Response(null,{status:204,headers:CORS});
  if(req.method!=='POST')
    return Response.json({ok:false,state:'METHOD_DENIED'},
      {status:405,headers:{...CORS,Allow:'POST, OPTIONS'}});
  const credential=req.headers.get('x-tfa-cron-secret')||'';
  if(!credential||credential.length>512)
    return Response.json({ok:false,state:'UNAUTHORIZED'},
      {status:401,headers:CORS});
  try{
    const base=Deno.env.get('SUPABASE_URL');
    const flwKey=Deno.env.get('FLW_SECRET_KEY');
    if(!base||!flwKey)throw new Error('billing_provider_not_configured');
    const key=secretKey();
    const credentialHash=await hash(credential);
    const tokens=await getJson(url(base,'runtime_tokens',{
      select:'token_hash',name:'eq.ingestion_cron',
      active:'eq.true',limit:'1'
    }),{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'});
    if(!Array.isArray(tokens)||tokens[0]?.token_hash!==credentialHash)
      return Response.json({ok:false,state:'UNAUTHORIZED'},
        {status:401,headers:CORS});
    // No 72h lookback and NO auto-expiration: an unanswered query does not
    // prove payment failed. Include old expired intents for manual review.
    // Do not silently report a complete scan when >25 records are available.
    const intents=await getJson(url(base,'checkout_intents',{
      select:'id,provider_reference,status,amount,currency,created_at',
      provider:'eq.flutterwave',
      status:'in.(created,pending,expired)',
      order:'created_at.asc',limit:String(MAX_SCAN+1)
    }),{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'});
    if(!Array.isArray(intents))throw new Error('invalid_checkout_rows');
    const truncated=intents.length>MAX_SCAN;
    const totals:Record<string,number>={
      VERIFIED_SUCCESS_MANUAL_COMMIT_REQUIRED:0,
      NO_CONFIRMED_PROVIDER_PAYMENT:0,
      PROVIDER_PARITY_MANUAL_HOLD:0,
      INCOMPLETE_LOCAL_EVIDENCE:0,
      MULTIPLE_PROVIDER_MATCHES_MANUAL_HOLD:0,
      PAGINATION_INCOMPLETE_MANUAL_HOLD:0,
      UNVERIFIED_PAGINATION_MANUAL_HOLD:0,
      PROVIDER_ERROR_RETRY_REQUIRED:0
    };
    for(const intent of intents.slice(0,MAX_SCAN)){
      let outcome:string;
      try{outcome=await providerProof(intent,flwKey);}
      catch{outcome='PROVIDER_ERROR_RETRY_REQUIRED';}
      totals[outcome]=(totals[outcome]||0)+1;
    }
    const unverified=Object.entries(totals).some(([key,value])=>
      value>0&&!['NO_CONFIRMED_PROVIDER_PAYMENT'].includes(key));
    const state=truncated?'PARTIAL_SCAN_MANUAL_HOLD':
      unverified?'RECONCILIATION_MANUAL_HOLD':'SAFE_READ_ONLY_AUDIT';
    // No IDs, provider refs, phone, email, raw payloads or transaction IDs
    // leave this endpoint. No provider POST, Rest POST/PATCH or side effects.
    return Response.json({
      ok:state==='SAFE_READ_ONLY_AUDIT',
      version:'v320-read-only-reconciliation-audit',
      state,checkout_rows_checked:Math.min(intents.length,MAX_SCAN),
      scan_truncated:truncated,manual_review_required:unverified||truncated,
      counts:totals,
      checkout_expired_by_this_run:0,charge_initiated:false,
      customer_entitlement_changed:false,provider_webhook_replayed:false
    },{status:state==='SAFE_READ_ONLY_AUDIT'?200:503,headers:CORS});
  }catch{
    return Response.json({ok:false,state:'RECONCILIATION_UNAVAILABLE',
      charge_initiated:false,customer_entitlement_changed:false},
      {status:503,headers:CORS});
  }
});
