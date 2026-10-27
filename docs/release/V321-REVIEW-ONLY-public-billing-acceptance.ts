
const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"content-type",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
  "Content-Type":"application/json"
};
// V321 REVIEW ONLY. Commercial activation requires separate merchant/owner signoff.
const COMMERCIAL_ACTIVATION_RELEASED=false;
const TTL=0;
let cache:any=null, cachedAt=0, inflight:Promise<any>|null=null;

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const parsed=JSON.parse(bundle);if(parsed?.default)return parsed.default}catch{}}
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw new Error("server_key_unavailable");
  return key;
}
function rest(base:string,table:string,params:Record<string,string>={}){
  const u=new URL(`${base}/rest/v1/${table}`);
  for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));
  return u;
}
async function rows(base:string,key:string,table:string,params:Record<string,string>={}){
  const r=await fetch(rest(base,table,params),{
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:"application/json"},
    signal:AbortSignal.timeout(2500)
  });
  if(!r.ok)throw new Error(`${table}_query_${r.status}`);
  return r.json();
}
function bool(v:any){return v===true||String(v).toLowerCase()==="true"}

async function build(){
  const base=Deno.env.get("SUPABASE_URL");
  const flwKey=Deno.env.get("FLW_SECRET_KEY");
  const flwHash=Deno.env.get("FLW_SECRET_HASH");
  if(!base)throw new Error("supabase_url_unavailable");
  const key=serverKey();

  // New private V321 read-only SQL readiness snapshot. NEVER trust recent
  // cron success alone or expose service role credentials to the browser.
  const opsRes=await fetch(base+'/rest/v1/rpc/billing_ops_readiness_v321',{
    method:'GET',
    headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json'},
    signal:AbortSignal.timeout(3500)
  });
  const ops=await opsRes.json().catch(()=>null);
  if(!opsRes.ok||ops?.ok!==true||ops?.ops_gate!=='PASS'){
    return {
      ok:true,version:'billing-acceptance-v321-hold',
      generated_at:new Date().toISOString(),provider:'flutterwave',
      state:'BLOCKED_OPS_GATES',ready_for_checkout:false,
      live_flow_verified:false,
      commercial_activation_permitted:false,
      ops_gate:opsRes.ok&&ops?.ops_gate==='HOLD'?'HOLD':'EVIDENCE_UNAVAILABLE',
      operational_evidence:opsRes.ok&&ops?.ok===true?{
        reconciliation_stale:ops.reconciliation?.stale_running??null,
        subscription_stale:ops.subscription_watch?.stale_running??null,
        reconciliation_failed_24h:ops.reconciliation?.cron_failed_24h??null,
        subscription_failed_24h:ops.subscription_watch?.cron_failed_24h??null
      }:null,
      governance:{creates_charges:false,mutates_subscriptions:false,
        mutations_permitted:false},
      truth_label:'BILLING_OPERATIONS_RECONCILIATION_HOLD'
    };
  }

  const [plans,mappings,payments,paidCheckouts,validSubs]=await Promise.all([
    rows(base,key,"plans",{select:"id,name,price_monthly_usd,is_active",is_active:"eq.true"}),
    rows(base,key,"billing_plan_mappings",{select:"plan_id,provider_plan_id,currency,recurring,is_active",provider:"eq.flutterwave",is_active:"eq.true"}),
    rows(base,key,"payment_events",{select:"event_type,plan_id,amount,currency,status,created_at,raw_payload",provider:"eq.flutterwave",status:"eq.successful",order:"created_at.desc",limit:"1"}),
    rows(base,key,"checkout_intents",{select:"id",provider:"eq.flutterwave",status:"eq.paid",limit:"1"}),
    rows(base,key,"subscriptions",{select:"id",provider:"eq.flutterwave",plan_id:"neq.free",status:"in.(active,trialing,canceled)",current_period_end:`gt.${new Date().toISOString()}`,limit:"1"})
  ]);

  const paidPlans=(plans||[]).filter((p:any)=>p.id!=="free");
  const mappingByPlan=new Map((mappings||[]).map((m:any)=>[m.plan_id,m]));
  const credentials=Boolean(flwKey&&flwHash);

  const providerChecks=await Promise.all(paidPlans.map(async(plan:any)=>{
    const mapping:any=mappingByPlan.get(plan.id);
    if(!mapping?.provider_plan_id){
      return {plan_id:plan.id,configured:false,provider_verified:false,reasons:["provider_plan_missing"]};
    }
    if(!credentials){
      return {plan_id:plan.id,configured:true,provider_verified:false,reasons:["provider_credentials_missing"]};
    }
    try{
      const r=await fetch(`https://api.flutterwave.com/v3/payment-plans/${encodeURIComponent(String(mapping.provider_plan_id))}`,{
        headers:{Authorization:`Bearer ${flwKey}`,Accept:"application/json"},
        signal:AbortSignal.timeout(7000)
      });
      const payload=await r.json().catch(()=>null);
      const d=payload?.data??null;
      const reasons:string[]=[];
      if(!r.ok||payload?.status!=="success"||!d)reasons.push("provider_lookup_failed");
      if(d&&Number(d.amount)!==Number(plan.price_monthly_usd))reasons.push("amount_mismatch");
      if(d&&String(d.currency||"").toUpperCase()!==String(mapping.currency||"USD").toUpperCase())reasons.push("currency_mismatch");
      if(d&&String(d.interval||"").toLowerCase()!=="monthly")reasons.push("interval_mismatch");
      if(d&&String(d.status||"").toLowerCase()!=="active")reasons.push("provider_plan_inactive");
      if(mapping.recurring!==true)reasons.push("local_mapping_not_recurring");
      return {
        plan_id:plan.id,
        configured:true,
        local_price_usd:Number(plan.price_monthly_usd),
        currency:String(mapping.currency||"USD").toUpperCase(),
        recurring:Boolean(mapping.recurring),
        provider_verified:reasons.length===0,
        provider_status:d?.status??null,
        provider_interval:d?.interval??null,
        reasons
      };
    }catch{
      return {plan_id:plan.id,configured:true,provider_verified:false,reasons:["provider_lookup_unavailable"]};
    }
  }));

  const latest=payments?.[0]??null;
  const raw=latest?.raw_payload??{};
  const verifiedProvider=Boolean(latest)&&(
    bool(raw?.verified) || bool(raw?.verified_signature)
  )&&["hmac_sha256","verif_hash"].includes(String(raw?.signature_mode||""));

  const planGate=providerChecks.length===paidPlans.length && providerChecks.every((x:any)=>x.provider_verified===true);
  const ledgerGate=Boolean(verifiedProvider && paidCheckouts?.length && validSubs?.length);
  const readyForCheckout=Boolean(COMMERCIAL_ACTIVATION_RELEASED&&credentials&&planGate);
  const state=readyForCheckout&&ledgerGate
    ?"LIVE_FLOW_VERIFIED"
    :readyForCheckout
      ?"READY_FOR_CONTROLLED_LIVE_TEST"
      :"BLOCKED";

  return {
    ok:true,
    version:"billing-acceptance-v321-read-only", 
    ops_gate:'PASS',
    commercial_activation_permitted:false,
    generated_at:new Date().toISOString(),
    provider:"flutterwave",
    mode:"read_only_no_charge",
    state,
    ready_for_checkout:readyForCheckout,
    live_flow_verified:ledgerGate,
    gates:{
      merchant_credentials:credentials?"PASS":"FAIL",
      provider_plan_parity:planGate?"PASS":"FAIL",
      signed_payment_evidence:verifiedProvider?"PASS":"WITHHELD",
      paid_checkout_evidence:paidCheckouts?.length?"PASS":"WITHHELD",
      active_entitlement_evidence:validSubs?.length?"PASS":"WITHHELD"
    },
    plans:providerChecks,
    evidence:latest?{
      last_successful_payment_at:latest.created_at??null,
      plan_id:latest.plan_id??null,
      amount:Number(latest.amount??0)||null,
      currency:latest.currency??null,
      provider_verification:true,
      signature_mode:raw?.signature_mode??null
    }:null,
    governance:{
      creates_charges:false,
      mutates_subscriptions:false,
      mutates_checkout_intents:false,
      provider_read_only:true,
      entitlement_ledger_authoritative:true
    },
    truth_label:"COMMERCIAL_ACCEPTANCE_READINESS_NOT_A_NEW_CHARGE"
  };
}
async function current(){
  if(cache&&Date.now()-cachedAt<TTL)return cache;
  if(inflight)return inflight;
  inflight=build().then(x=>{cache=x;cachedAt=Date.now();return x}).finally(()=>{inflight=null});
  return inflight;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
  if(req.method!=="GET")return Response.json({ok:false,error:"method_not_allowed"},{status:405,headers:{...CORS,Allow:"GET, OPTIONS"}});
  try{
    return Response.json(await current(),{headers:{...CORS,"Cache-Control":"private, no-store"}});
  }catch(e){
    console.error(e);
    return Response.json({
      ok:false,
      version:"billing-acceptance-v1",
      generated_at:new Date().toISOString(),
      state:"EVIDENCE_GATED",
      ready_for_checkout:false,
      live_flow_verified:false,
      governance:{creates_charges:false,mutates_subscriptions:false,provider_read_only:true},
      truth_label:"COMMERCIAL_ACCEPTANCE_READINESS_UNAVAILABLE"
    },{status:503,headers:{...CORS,"Cache-Control":"private, no-store"}});
  }
});
