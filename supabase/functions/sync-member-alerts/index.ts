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
async function insert(base:string,k:string,t:string,body:any[]){
  if(!body.length)return;
  const r=await dbFetch(u(base,t),{
    method:'POST',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`${t}_insert_${r.status}:${(await r.text()).slice(0,300)}`);
}
async function patchRun(base:string,k:string,id:string,body:any){
  const r=await dbFetch(u(base,'agent_runs',{id:`eq.${id}`}),{
    method:'PATCH',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(body)
  });
  if(!r.ok)throw new Error(`run_patch_${r.status}`);
}
async function startRun(base:string,k:string){
  const r=await dbFetch(u(base,'agent_runs'),{
    method:'POST',
    headers:{apikey:k,Authorization:`Bearer ${k}`,'Content-Type':'application/json',Prefer:'return=representation'},
    body:JSON.stringify([{
      agent_type:'member_alert_sync',
      status:'running',
      started_at:new Date().toISOString(),
      input_summary:'Fan out verified intelligence alerts into member notification inboxes according to preferences and Radar watchlists.',
      metadata:{framework_version:'member_alert_sync_v19_8_1_fail_fast'}
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

    const token=await rows(base,k,'runtime_tokens',{
      select:'token_hash',
      name:'eq.ingestion_cron',
      active:'eq.true',
      limit:'1'
    });
    if(!token?.[0]?.token_hash||(await sha256Hex(supplied))!==token[0].token_hash){
      return Response.json({ok:false,error:'unauthorized'},{status:401,headers:cors});
    }

    runId=await startRun(base,k);
    const now=new Date().toISOString();
    const [alerts,prefs,watchlists,items,existing]=await Promise.all([
      rows(base,k,'alerts',{select:'id,alert_key,trend_id,severity,title,message,trigger_type,expires_at,created_at,metadata',expires_at:`gt.${now}`,order:'created_at.desc',limit:'200'}),
      rows(base,k,'member_notification_preferences',{select:'user_id,in_app_enabled,trend_alerts',in_app_enabled:'eq.true',trend_alerts:'eq.true',limit:'5000'}),
      rows(base,k,'watchlists',{select:'id,user_id',limit:'5000'}),
      rows(base,k,'watchlist_items',{select:'watchlist_id,trend_id',limit:'20000'}),
      rows(base,k,'member_notifications',{select:'user_id,dedupe_key',dedupe_key:'like.alert:%',limit:'50000'})
    ]);

    const wlUser=new Map((watchlists||[]).map((x:any)=>[String(x.id),String(x.user_id)]));
    const watched=new Map<string,Set<string>>();
    for(const x of items||[]){
      const uid=wlUser.get(String(x.watchlist_id));
      if(!uid)continue;
      if(!watched.has(uid))watched.set(uid,new Set());
      watched.get(uid)!.add(String(x.trend_id));
    }

    const existingKeys=new Set((existing||[]).map((x:any)=>`${x.user_id}|${x.dedupe_key}`));
    const rank:any={info:0,watch:1,important:2,critical:3};
    const out:any[]=[];

    for(const pref of prefs||[]){
      const uid=String(pref.user_id),set=watched.get(uid)||new Set<string>();
      for(const a of alerts||[]){
        const sev=String(a.severity||'info');
        const isWatched=a.trend_id&&set.has(String(a.trend_id));
        const globalMaterial=rank[sev]>=2;
        if(!isWatched&&!globalMaterial)continue;
        if(rank[sev]<1)continue;
        const dedupe=`alert:${a.alert_key||a.id}`;
        if(existingKeys.has(`${uid}|${dedupe}`))continue;
        out.push({
          user_id:uid,
          notification_type:'trend_alert',
          title:String(a.title||'Intelligence alert').slice(0,240),
          message:String(a.message||'').slice(0,1200),
          link:'/intelligence?vertical=global_trends',
          metadata:{severity:sev,trigger_type:a.trigger_type,trend_id:a.trend_id,watchlisted:!!isWatched,source:'verified_alert_ledger'},
          dedupe_key:dedupe
        });
        existingKeys.add(`${uid}|${dedupe}`);
      }
    }

    if(out.length)await insert(base,k,'member_notifications',out);
    await patchRun(base,k,runId,{
      status:'succeeded',
      completed_at:new Date().toISOString(),
      output_summary:`Synchronized ${out.length} member notifications from ${alerts.length} active alerts across ${prefs.length} opted-in members.`,
      metadata:{
        framework_version:'member_alert_sync_v19_8_1_fail_fast',
        active_alerts:alerts.length,
        opted_in_members:prefs.length,
        notifications_created:out.length
      }
    });

    return Response.json(
      {ok:true,version:'member_alert_sync_v19_8_1_fail_fast',active_alerts:alerts.length,opted_in_members:prefs.length,notifications_created:out.length},
      {headers:{...cors,'Cache-Control':'no-store','X-TFA-Recovery':'FAIL_FAST_DB'}}
    );
  }catch(e){
    console.error('MEMBER_ALERT_SYNC_FAIL_FAST',String(e).slice(0,500));
    if(runId){
      try{
        await patchRun(base,k,runId,{
          status:'failed',
          completed_at:new Date().toISOString(),
          error:String(e).slice(0,1200),
          output_summary:'Member alert synchronization failed closed.'
        });
      }catch{}
    }
    return Response.json(
      {ok:false,error:'member_alert_sync_failed',state:'FAIL_CLOSED',detail:String(e).slice(0,180)},
      {status:503,headers:{...cors,'Cache-Control':'no-store','X-TFA-Recovery':'FAIL_FAST_DB'}}
    );
  }
});
