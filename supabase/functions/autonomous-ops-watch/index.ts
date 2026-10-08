const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'content-type, x-tfa-cron-secret',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};
const DB_TIMEOUT_MS=2500;

function key(){
  const bundled=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundled){
    try{
      const parsed=JSON.parse(bundled);
      if(parsed?.default)return parsed.default;
    }catch{}
  }
  const k=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!k)throw new Error('server key unavailable');
  return k;
}
async function sha256Hex(s:string){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function u(base:string,t:string,p:Record<string,string>={}){
  const x=new URL(`${base}/rest/v1/${t}`);
  for(const[k,v]of Object.entries(p))x.searchParams.set(k,String(v));
  return x;
}
async function dbFetch(input:RequestInfo|URL,init:RequestInit={}){
  return fetch(input,{...init,signal:AbortSignal.timeout(DB_TIMEOUT_MS)});
}
async function rows(base:string,k:string,t:string,p:Record<string,string>={}){
  const r=await dbFetch(u(base,t,p),{headers:{apikey:k,Authorization:`Bearer ${k}`,Accept:'application/json'}});
  if(!r.ok)throw new Error(`${t}_${r.status}`);
  return r.json();
}
async function upsert(base:string,k:string,body:any[]){
  if(!body.length)return;
  const r=await dbFetch(u(base,'autonomous_ops_events',{on_conflict:'event_key'}),{
    method:'POST',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`ops_upsert_${r.status}:${(await r.text()).slice(0,300)}`);
}
async function patch(base:string,k:string,t:string,p:Record<string,string>,body:any){
  const r=await dbFetch(u(base,t,p),{
    method:'PATCH',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`${t}_patch_${r.status}`);
}
async function startRun(base:string,k:string){
  const r=await dbFetch(u(base,'agent_runs'),{
    method:'POST',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=representation'},
    body:JSON.stringify([{
      agent_type:'autonomous_ops_watch',
      status:'running',
      started_at:new Date().toISOString(),
      input_summary:'Evaluate operational health, automation failures, required connectors, incidents and outbound-delivery backlog.',
      metadata:{framework_version:'autonomous_ops_v19_8_1_fail_fast'}
    }])
  });
  if(!r.ok)throw new Error(`run_insert_${r.status}`);
  return (await r.json())?.[0]?.id;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:cors});

  const base=Deno.env.get('SUPABASE_URL');
  if(!base)return Response.json({ok:false,error:'server_not_configured'},{status:503,headers:cors});
  const k=key();
  let runId='';

  try{
    const supplied=req.headers.get('x-tfa-cron-secret')||'';
    if(!supplied)return Response.json({ok:false,error:'unauthorized'},{status:401,headers:cors});

    const tok=await rows(base,k,'runtime_tokens',{
      select:'token_hash',
      name:'eq.ingestion_cron',
      active:'eq.true',
      limit:'1'
    });
    if(!tok?.[0]?.token_hash||(await sha256Hex(supplied))!==tok[0].token_hash){
      return Response.json({ok:false,error:'unauthorized'},{status:401,headers:cors});
    }

    runId=await startRun(base,k);
    const now=Date.now();
    const since1h=new Date(now-3600000).toISOString();

    const [failedRuns,connectors,emailFailed,emailRetry,incidents,smokes]=await Promise.all([
      rows(base,k,'agent_runs',{select:'agent_type,status,completed_at,error',status:'eq.failed',created_at:`gte.${since1h}`,order:'created_at.desc',limit:'100'}),
      rows(base,k,'source_connectors',{select:'connector_key,publisher,required_for_launch,active,last_success_at,last_http_status,last_error',required_for_launch:'eq.true',active:'eq.true',limit:'100'}),
      rows(base,k,'transactional_email_outbox',{select:'id,status,attempts,updated_at,last_error',status:'eq.failed',updated_at:`gte.${since1h}`,limit:'100'}),
      rows(base,k,'transactional_email_outbox',{select:'id,status,attempts,scheduled_at,updated_at,last_error',status:'eq.retry',limit:'100'}),
      rows(base,k,'status_incidents',{select:'id,title,severity,status,started_at',status:'neq.resolved',limit:'100'}),
      rows(base,k,'agent_runs',{select:'status,completed_at,output_summary,error,metadata',agent_type:'eq.production_smoke_sweep',completed_at:'not.is.null',order:'completed_at.desc',limit:'1'})
    ]);

    const requiredBad=(connectors||[]).filter((c:any)=>
      !c.last_success_at||
      new Date(c.last_success_at).getTime()<now-7200000||
      Number(c.last_http_status||0)>=400
    );
    const majorInc=(incidents||[]).filter((x:any)=>['major','critical'].includes(String(x.severity)));
    const latestSmoke=smokes?.[0];
    const smokeBad=!latestSmoke||
      latestSmoke.status!=='succeeded'||
      new Date(latestSmoke.completed_at||0).getTime()<now-3600000;

    const checks=[
      {
        event_key:'ops:failed_agent_runs',
        open:(failedRuns||[]).length>0,
        severity:'important',
        category:'automation',
        title:'Recent automation failures',
        summary:`${failedRuns.length} agent run(s) failed in the last hour.`,
        details:{count:failedRuns.length,agent_types:[...new Set((failedRuns||[]).map((x:any)=>x.agent_type))].slice(0,20)}
      },
      {
        event_key:'ops:required_connectors',
        open:requiredBad.length>0,
        severity:'important',
        category:'data',
        title:'Required connector degradation',
        summary:`${requiredBad.length} required connector(s) are stale or failing.`,
        details:{count:requiredBad.length,publishers:requiredBad.map((x:any)=>x.publisher).slice(0,20)}
      },
      {
        event_key:'ops:email_delivery',
        open:(emailFailed||[]).length>0||(emailRetry||[]).length>=10,
        severity:(emailFailed||[]).length?'important':'watch',
        category:'communications',
        title:'Transactional email delivery pressure',
        summary:`${emailFailed.length} failed and ${emailRetry.length} retrying outbound email(s).`,
        details:{failed:emailFailed.length,retrying:emailRetry.length}
      },
      {
        event_key:'ops:incidents',
        open:majorInc.length>0,
        severity:majorInc.some((x:any)=>x.severity==='critical')?'critical':'important',
        category:'incident',
        title:'Major production incident open',
        summary:`${majorInc.length} major/critical incident(s) remain unresolved.`,
        details:{count:majorInc.length,severities:majorInc.map((x:any)=>x.severity)}
      },
      {
        event_key:'ops:smoke_health',
        open:smokeBad,
        severity:'critical',
        category:'qa',
        title:'Fresh production smoke unavailable',
        summary:smokeBad?'No fresh successful production smoke is available inside the one-hour acceptance window.':'Production smoke is healthy.',
        details:{
          latest_status:latestSmoke?.status||null,
          completed_at:latestSmoke?.completed_at||null,
          summary:latestSmoke?.output_summary||null
        }
      }
    ];

    const existing=await rows(base,k,'autonomous_ops_events',{
      select:'event_key,state',
      event_key:'like.ops:%',
      limit:'100'
    });
    const ex=new Map((existing||[]).map((x:any)=>[x.event_key,x.state]));
    const toUpsert:any[]=[];

    for(const c of checks){
      if(c.open){
        toUpsert.push({
          event_key:c.event_key,
          severity:c.severity,
          category:c.category,
          state:'open',
          title:c.title,
          summary:c.summary,
          details:c.details,
          observed_at:new Date().toISOString(),
          cleared_at:null,
          updated_at:new Date().toISOString()
        });
      }else if(ex.get(c.event_key)==='open'){
        toUpsert.push({
          event_key:c.event_key,
          severity:c.severity,
          category:c.category,
          state:'cleared',
          title:c.title,
          summary:'Condition cleared by autonomous operations watch.',
          details:c.details,
          observed_at:new Date().toISOString(),
          cleared_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        });
      }
    }

    if(toUpsert.length)await upsert(base,k,toUpsert);

    const openCount=checks.filter(c=>c.open).length;
    const critical=checks.filter(c=>c.open&&c.severity==='critical').length;

    await patch(base,k,'agent_runs',{id:`eq.${runId}`},{
      status:'succeeded',
      completed_at:new Date().toISOString(),
      output_summary:`Autonomous ops v19.8.1: ${openCount} open condition(s), ${critical} critical.`,
      metadata:{
        framework_version:'autonomous_ops_v19_8_1_fail_fast',
        open_conditions:openCount,
        critical_conditions:critical,
        checks:checks.map(c=>({event_key:c.event_key,open:c.open,severity:c.severity}))
      }
    });

    return Response.json({
      ok:true,
      version:'autonomous_ops_v19_8_1_fail_fast',
      state:critical?'ATTENTION':openCount?'WATCH':'GREEN',
      open_conditions:openCount,
      critical_conditions:critical,
      checks:checks.map(c=>({key:c.event_key,open:c.open,severity:c.severity,category:c.category,title:c.title,summary:c.summary}))
    },{
      headers:{...cors,'Cache-Control':'no-store','X-TFA-Recovery':'FAIL_FAST_DB'}
    });
  }catch(e){
    console.error('AUTONOMOUS_OPS_FAIL_FAST',String(e).slice(0,500));
    if(runId){
      try{
        await patch(base,k,'agent_runs',{id:`eq.${runId}`},{
          status:'failed',
          completed_at:new Date().toISOString(),
          error:String(e).slice(0,1500),
          output_summary:'Autonomous operations watch failed closed.'
        });
      }catch{}
    }
    return Response.json({
      ok:false,
      error:'autonomous_ops_watch_failed',
      state:'FAIL_CLOSED',
      detail:String(e).slice(0,180)
    },{
      status:503,
      headers:{...cors,'Cache-Control':'no-store','X-TFA-Recovery':'FAIL_FAST_DB'}
    });
  }
});
