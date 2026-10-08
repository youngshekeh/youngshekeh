import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'content-type, x-tfa-cron-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const EDGE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';
const MIN_INTERVAL_MS=10*60_000;
async function incident(){try{const r=await fetch('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-v69-database-incident-shield',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(1500)});return r.ok?await r.json():null}catch{return null}}

function serverKey(){
  const b=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(b){try{const p=JSON.parse(b);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!k)throw new Error('server key unavailable');
  return k;
}
async function sha256Hex(s:string){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function restUrl(base:string,table:string,params:Record<string,string>={}){
  const x=new URL(`${base}/rest/v1/${table}`);
  for(const [k,v] of Object.entries(params))x.searchParams.set(k,String(v));
  return x;
}
async function rows(base:string,k:string,table:string,params:Record<string,string>={}){
  const r=await fetch(restUrl(base,table,params),{headers:{apikey:k,Authorization:`Bearer ${k}`,Accept:'application/json'},signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error(`${table}_${r.status}`);
  return r.json();
}
async function insert(base:string,k:string,table:string,body:any){
  const r=await fetch(restUrl(base,table),{method:'POST',headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(body),signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error(`${table}_insert_${r.status}`);
  return r.json();
}
async function patch(base:string,k:string,table:string,params:Record<string,string>,body:any){
  const r=await fetch(restUrl(base,table,params),{method:'PATCH',headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body),signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error(`${table}_patch_${r.status}`);
}
function semantic(path:string,b:any){
  if(!b||b.ok===false)return false;
  if(path==='public-v55-executive-market-board')return String(b.version||'').startsWith('v55-')&&!!b.runtime_policy;
  if(path==='public-v50-production-integrity')return String(b.version||'').startsWith('v50-')&&String(b.state||'')!=='DEGRADED';
  if(path==='public-app-config')return b.runtime_safety?.mode==='CONTROLLED_LOAD'&&b.runtime_safety?.high_frequency_polling===false;
  return true;
}
async function probe(path:string){
  const started=Date.now();
  try{
    const r=await fetch(`${EDGE}/${path}`,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(3000)});
    const b=await r.json().catch(()=>null);
    return {path,kind:'public_core',http_status:r.status,ok:r.ok&&semantic(path,b),ms:Date.now()-started};
  }catch(e){return {path,kind:'public_core',http_status:0,ok:false,ms:Date.now()-started,error:String(e).slice(0,180)}}
}
async function authBoundary(path:string,method='GET'){
  const started=Date.now();
  try{
    const init:any={method,headers:{Accept:'application/json','Content-Type':'application/json'},signal:AbortSignal.timeout(2500)};
    if(method==='POST')init.body='{}';
    const r=await fetch(`${EDGE}/${path}`,init);
    return {path,kind:'auth_boundary',http_status:r.status,ok:r.status===401,ms:Date.now()-started};
  }catch(e){return {path,kind:'auth_boundary',http_status:0,ok:false,ms:Date.now()-started,error:String(e).slice(0,180)}}
}
async function storeProbe(name:string,fn:()=>Promise<any>){
  const started=Date.now();
  try{const detail=await fn();return {path:name,kind:'governed_store',http_status:200,ok:detail?.ok===true,ms:Date.now()-started,...detail}}
  catch(e){return {path:name,kind:'governed_store',http_status:0,ok:false,ms:Date.now()-started,error:String(e).slice(0,180)}}
}
async function snapshotProbe(base:string,k:string,table:string,statusCol:string,stateCol:string,actionCol:string,name:string){
  return storeProbe(name,async()=>{
    const a=await rows(base,k,table,{select:`captured_at,${statusCol},${stateCol},${actionCol},capital_permission`,order:'captured_at.desc',limit:'1'});
    const x=a?.[0];
    const age=x?.captured_at?(Date.now()-new Date(x.captured_at).getTime())/36e5:9999;
    const closed=String(x?.[statusCol]||'')==='MARKET_CLOSED';
    return {ok:!!x&&!!x[stateCol]&&!!x[actionCol]&&!!x.capital_permission&&((closed&&age<=72)||(!closed&&age<=3)),age_hours:Number.isFinite(age)?Math.round(age*100)/100:null};
  });
}
async function reportStore(base:string,k:string){
  return storeProbe('publication-store',async()=>{
    const rs=await rows(base,k,'reports',{select:'report_type,publication_ts,data_as_of,report_code',status:'eq.published',is_public:'eq.true',report_type:'in.(global_trends_daily,global_markets_daily,nigeria_economy)',order:'publication_ts.desc',limit:'20'});
    const needed=['global_trends_daily','global_markets_daily','nigeria_economy'];
    const latest:any={};
    for(const r of rs||[])if(!latest[r.report_type])latest[r.report_type]=r;
    const available=needed.filter(x=>!!latest[x]).length;
    return {ok:available===needed.length,available,total:needed.length,report_codes:needed.map(x=>latest[x]?.report_code??null)};
  });
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:CORS});
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:CORS});
  const supplied=req.headers.get('x-tfa-cron-secret')||'';
  if(!supplied)return Response.json({ok:false,error:'unauthorized'},{status:401,headers:CORS});
  const inc=await incident();
  if(inc?.incident_active)return Response.json({ok:false,status:'blocked_database_incident',incident_code:inc.incident_code,rate_safe:true,store_probe_count:0,mutations_permitted:false},{status:503,headers:{...CORS,'Cache-Control':'no-store','Retry-After':'300'}});
  const base=Deno.env.get('SUPABASE_URL');
  if(!base)return Response.json({ok:false,error:'server_not_configured'},{status:503,headers:CORS});
  const k=serverKey();
  let runId:any=null;
  try{
    const tok=await rows(base,k,'runtime_tokens',{select:'token_hash',name:'eq.ingestion_cron',active:'eq.true',limit:'1'});
    if(!tok?.[0]?.token_hash||(await sha256Hex(supplied))!==tok[0].token_hash)return Response.json({ok:false,error:'unauthorized'},{status:401,headers:CORS});

    const recent=await rows(base,k,'agent_runs',{select:'id,status,completed_at,output_summary,metadata',agent_type:'eq.production_smoke_sweep',order:'started_at.desc',limit:'5'}).catch(()=>[]);
    const prior=(recent||[]).find((x:any)=>x?.completed_at&&Number.isFinite(new Date(x.completed_at).getTime()));
    if(prior&&Date.now()-new Date(prior.completed_at).getTime()<MIN_INTERVAL_MS){
      return Response.json({ok:true,status:'skipped_recent',rate_safe:true,min_interval_seconds:MIN_INTERVAL_MS/1000,previous_run_id:prior.id,previous_completed_at:prior.completed_at,previous_summary:prior.output_summary??null},{headers:{...CORS,'Cache-Control':'no-store'}});
    }

    const rr=await insert(base,k,'agent_runs',[{agent_type:'production_smoke_sweep',status:'running',started_at:new Date().toISOString(),input_summary:'Rate-safe production smoke: three cached public cores, three protected auth boundaries and three governed-store checks.',metadata:{framework_version:'production_smoke_v57_1_fail_fast',rate_safe:true,min_interval_seconds:MIN_INTERVAL_MS/1000}}]);
    runId=rr?.[0]?.id||null;

    const publicResults=await Promise.all([
      probe('public-v55-executive-market-board'),
      probe('public-v50-production-integrity'),
      probe('public-app-config')
    ]);
    const authResults=await Promise.all([
      authBoundary('member-session','GET'),
      authBoundary('owner-launch-readiness','GET'),
      authBoundary('enterprise-client-status','GET')
    ]);
    const stores=await Promise.all([
      snapshotProbe(base,k,'gold_live_snapshots','feed_status','engine_state','action','gold-live-snapshot-store'),
      snapshotProbe(base,k,'live_markets_snapshots','market_status','regime_state','decision_action','live-markets-snapshot-store'),
      reportStore(base,k)
    ]);

    const results=[...publicResults,...authResults,...stores];
    const failed=results.filter((x:any)=>!x.ok);
    const times=results.map((x:any)=>Number(x.ms||0)).sort((a:number,b:number)=>a-b);
    const p95=times[Math.min(times.length-1,Math.max(0,Math.ceil(times.length*.95)-1))]||0;
    const status=failed.length?'failed':'succeeded';
    const summary=`Production smoke v57 safe: ${results.length-failed.length}/${results.length} healthy; ${failed.length} failed; 6 Edge probes; 3 direct governed-store checks; p95 ${p95}ms.`;
    if(runId)await patch(base,k,'agent_runs',{id:`eq.${runId}`},{status,completed_at:new Date().toISOString(),output_summary:summary,error:failed.length?failed.map((x:any)=>`${x.path}:${x.http_status}:${x.kind}`).join(', '):null,metadata:{framework_version:'production_smoke_v57_1_fail_fast',rate_safe:true,total:results.length,healthy:results.length-failed.length,failed:failed.length,edge_probe_count:publicResults.length+authResults.length,store_probe_count:stores.length,p95_ms:p95,results}});
    return Response.json({ok:failed.length===0,status,rate_safe:true,total:results.length,healthy:results.length-failed.length,failed:failed.length,edge_probe_count:publicResults.length+authResults.length,store_probe_count:stores.length,p95_ms:p95,results},{status:failed.length?503:200,headers:{...CORS,'Cache-Control':'no-store'}});
  }catch(e){
    const msg=e instanceof Error?e.message:String(e);
    if(runId){try{await patch(base,k,'agent_runs',{id:`eq.${runId}`},{status:'failed',completed_at:new Date().toISOString(),error:msg.slice(0,2000)})}catch{}}
    return Response.json({ok:false,error:'production_smoke_failed',detail:msg.slice(0,300)},{status:500,headers:CORS});
  }
});