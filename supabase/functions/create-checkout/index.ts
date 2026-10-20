const ALLOWED_ORIGINS=new Set(['https://thefatheranalytics.com','https://www.thefatheranalytics.com']);function cors(req:Request){const origin=req.headers.get('origin')||'';return{"Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(origin)?origin:'https://thefatheranalytics.com',"Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}};
function serverKey(){const b=Deno.env.get("SUPABASE_SECRET_KEYS");if(b){try{const p=JSON.parse(b);if(p?.default)return p.default}catch{}}const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!k)throw new Error("server key unavailable");return k}
function restUrl(base:string,table:string,params:Record<string,string>={}){const u=new URL(`${base}/rest/v1/${table}`);for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);return u}
async function rows(base:string,key:string,table:string,params:Record<string,string>){const r=await fetch(restUrl(base,table,params),{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'}});if(!r.ok)throw new Error(`${table} query failed ${r.status}`);return r.json()}
async function insert(base:string,key:string,table:string,body:any){const r=await fetch(restUrl(base,table),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${table} insert failed ${r.status}: ${await r.text()}`);return r.json()}
async function patchRows(base:string,key:string,table:string,filters:Record<string,string>,body:any){const r=await fetch(restUrl(base,table,filters),{method:'PATCH',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`${table} patch failed ${r.status}: ${await r.text()}`)}
// Commercial launch authorization is server-side and uses fresh, independently
// verified evidence. Failed checks create no checkout intents or provider calls.
async function requireCommercialAcceptance(base:string,key:string){
  const read=async(name:string)=>{
    const res=await fetch(`${base}/functions/v1/${name}`,{
      headers:{apikey:key,Accept:'application/json','Cache-Control':'no-store'},
      signal:AbortSignal.timeout(9000)
    });
    if(!res.ok)throw new Error('commercial_gate_unavailable');
    return await res.json();
  };
  const [final,billing]=await Promise.all([
    read('public-final-readiness'),read('public-billing-acceptance')
  ]);
  const isFresh=(x:any)=>{
    const t=Date.parse(String(x?.generated_at||''));
    return Number.isFinite(t)&&t<=Date.now()+60000&&Date.now()-t<=10*60*1000;
  };
  const finalGood=final?.ok===true&&isFresh(final)&&final?.state==='FULL_ACCEPTANCE_READY'
    &&final?.database_incident?.active===false
    &&Array.isArray(final?.hard_blockers)&&final.hard_blockers.length===0
    &&Array.isArray(final?.acceptance_pending)&&final.acceptance_pending.length===0
    &&Array.isArray(final?.external_unknowns)&&final.external_unknowns.length===0;
  const billingGood=billing?.ok===true&&isFresh(billing)
    &&billing?.ready_for_checkout===true&&billing?.live_flow_verified===true
    &&billing?.state==='LIVE_FLOW_VERIFIED';
  if(!finalGood||!billingGood)throw new Error('commercial_acceptance_not_verified');
  // Require two distinct recent successful autonomous runs before charging.
  // REST failure also fails closed and cannot authorize a checkout.
  const u=restUrl(base,'command_ops_kernel_runs',{
    select:'run_key,status,finished_at',status:'eq.SUCCEEDED',
    finished_at:`gte.${new Date(Date.now()-16*60*1000).toISOString()}`,
    order:'finished_at.desc',limit:'10'
  });
  const res=await fetch(u,{
    headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},
    signal:AbortSignal.timeout(8500)
  });
  if(!res.ok)throw new Error('recent_kernel_receipts_unavailable');
  const runs=await res.json().catch(()=>[]);
  if(!Array.isArray(runs)||new Set(runs.map((x:any)=>x?.run_key).filter(Boolean)).size<2)
    throw new Error('two_kernel_successes_not_verified');
}
Deno.serve(async(req:Request)=>{const h=cors(req);if(req.method==='OPTIONS')return new Response('ok',{headers:h});if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{...h,Allow:'POST, OPTIONS'}});try{const base=Deno.env.get('SUPABASE_URL');if(!base)throw new Error('SUPABASE_URL unavailable');const auth=req.headers.get('authorization')||'';if(!auth.toLowerCase().startsWith('bearer '))return Response.json({ok:false,error:'unauthorized'},{status:401,headers:h});const key=serverKey();const ur=await fetch(`${base}/auth/v1/user`,{headers:{apikey:key,Authorization:auth}});if(!ur.ok)return Response.json({ok:false,error:'invalid_session'},{status:401,headers:h});const user=await ur.json();const body=await req.json();const planId=String(body?.plan_id||'').trim().toLowerCase();if(!['pro','executive','business','enterprise'].includes(planId))return Response.json({ok:false,error:'invalid_plan'},{status:400,headers:h});await requireCommercialAcceptance(base,key);const [planRows,mapRows]=await Promise.all([rows(base,key,'plans',{select:'id,name,price_monthly_usd,is_active',id:`eq.${planId}`,is_active:'eq.true',limit:'1'}),rows(base,key,'billing_plan_mappings',{select:'provider,plan_id,provider_plan_id,currency,recurring,is_active',provider:'eq.flutterwave',plan_id:`eq.${planId}`,is_active:'eq.true',limit:'1'})]);const plan=planRows?.[0],map=mapRows?.[0];if(!plan)return Response.json({ok:false,error:'plan_unavailable'},{status:404,headers:h});if(!map?.provider_plan_id||!map?.recurring)return Response.json({ok:false,error:'billing_plan_setup_required',provider:'flutterwave',plan_id:planId},{status:503,headers:{...h,'Cache-Control':'no-store'}});const flwKey=Deno.env.get('FLW_SECRET_KEY');if(!flwKey)return Response.json({ok:false,error:'payment_provider_not_configured',provider:'flutterwave'},{status:503,headers:{...h,'Cache-Control':'no-store'}});
const cutoff=new Date(Date.now()-30*60*1000).toISOString();
const existingRows=await rows(base,key,'checkout_intents',{select:'id,checkout_url,provider_reference,created_at',user_id:`eq.${user.id}`,plan_id:`eq.${planId}`,provider:'eq.flutterwave',status:'eq.pending',created_at:`gte.${cutoff}`,order:'created_at.desc',limit:'1'});
const existing=existingRows?.[0];
if(existing?.checkout_url)return Response.json({ok:true,provider:'flutterwave',plan_id:planId,checkout_url:existing.checkout_url,reference:existing.provider_reference,reused:true},{status:200,headers:{...h,'Cache-Control':'no-store'}});
await patchRows(base,key,'checkout_intents',{user_id:`eq.${user.id}`,plan_id:`eq.${planId}`,provider:'eq.flutterwave',status:'in.(created,pending)',created_at:`lt.${cutoff}`},{status:'expired',updated_at:new Date().toISOString(),metadata:{billing_period:'month',recurring:true,expired_reason:'stale_checkout_superseded'}});
const reference=`TFA-${planId.toUpperCase()}-${crypto.randomUUID()}`;const amount=Number(plan.price_monthly_usd);const linkExpiration=new Date(Date.now()+30*60*1000).toISOString();const created=await insert(base,key,'checkout_intents',{user_id:user.id,plan_id:planId,provider:'flutterwave',amount,currency:map.currency||'USD',status:'created',provider_reference:reference,metadata:{billing_period:'month',recurring:true,link_expiration:linkExpiration}});const intent=created?.[0];const paymentPayload={tx_ref:reference,amount,currency:map.currency||'USD',redirect_url:'https://thefatheranalytics.com/member?payment=return',link_expiration:linkExpiration,customer:{email:user.email||'',name:user.user_metadata?.full_name||user.email||'THE FATHER ANALYTICS Member'},customizations:{title:`THE FATHER ANALYTICS · ${plan.name}`,description:`${plan.name} monthly intelligence membership`},payment_plan:Number(map.provider_plan_id),meta:{checkout_intent_id:intent?.id,user_id:user.id,plan_id:planId}};const fr=await fetch('https://api.flutterwave.com/v3/payments',{method:'POST',headers:{Authorization:`Bearer ${flwKey}`,'Content-Type':'application/json'},body:JSON.stringify(paymentPayload)});const fp=await fr.json().catch(()=>null);if(!fr.ok||fp?.status!=='success'||!fp?.data?.link){await patchRows(base,key,'checkout_intents',{id:`eq.${intent?.id}`},{status:'failed',updated_at:new Date().toISOString(),metadata:{billing_period:'month',recurring:true,link_expiration:linkExpiration,provider_error:fp?.message||`HTTP ${fr.status}`}});return Response.json({ok:false,error:'checkout_creation_failed',provider:'flutterwave'},{status:502,headers:{...h,'Cache-Control':'no-store'}})}await patchRows(base,key,'checkout_intents',{id:`eq.${intent?.id}`},{status:'pending',checkout_url:fp.data.link,updated_at:new Date().toISOString()});return Response.json({ok:true,provider:'flutterwave',plan_id:planId,checkout_url:fp.data.link,reference,reused:false,expires_at:linkExpiration,return_url:'https://thefatheranalytics.com/member?payment=return'},{status:200,headers:{...h,'Cache-Control':'no-store'}})}catch(e){console.error(e);return Response.json({ok:false,error:'checkout_unavailable'},{status:503,headers:{...h,'Cache-Control':'no-store'}})}});