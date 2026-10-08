import postgres from "npm:postgres@3.4.7";

const AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const DB_URL=Deno.env.get('SUPABASE_DB_URL')||'';
function pooledDbUrl(){const u=new URL(DB_URL);u.port='6543';return u.toString()}

function eq(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function authorized(req:Request){
  const a=req.headers.get('authorization')||'',t=a.toLowerCase().startsWith('bearer ')?a.slice(7).trim():'';
  if(!t)return false;
  if(SERVICE_ROLE&&eq(t,SERVICE_ROLE))return true;
  try{
    const r=await fetch(AUTHZ,{headers:{Authorization:a,Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    const b=await r.json().catch(()=>null);
    return r.ok&&b?.ok===true&&b?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}

const TARGETS=[
  {key:'CONTRACT_RESOLUTION',pattern:'%tfa_resolve_all_gold_contracts%',desired:'0-59/5 * * * *',lane:'INTERNAL_STATE',reason:'Contract resolution is important but not required every minute while database connectivity is saturated.'},
  {key:'EXPOSURE_REFRESH',pattern:'%tfa_refresh_gold_exposure_objects%',desired:'1-59/5 * * * *',lane:'INTERNAL_STATE',reason:'Exposure refresh is phase-staggered away from contract resolution.'},
  {key:'PERMISSION_COMPILE',pattern:'%tfa_gold_compile_permission_v1%',desired:'1-59/2 * * * *',lane:'SAFETY',reason:'Permission compilation remains frequent but moves to an odd two-minute phase. Stale permission remains fail-closed.'},
  {key:'V123_TRANSITIONS',pattern:'%detect_v123_gold_transitions%',desired:'0-59/2 * * * *',lane:'SIGNAL',reason:'Transition detection remains frequent on the even two-minute phase.'},
  {key:'V191_EVENT_CAPTURE',pattern:'%runtime-v191-gold-signal-event-capture%',desired:'2-59/5 * * * *',lane:'EVENT_CAPTURE',reason:'Event capture is observational and can absorb a five-minute recovery cadence during database pressure.'}
];

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401});
  if(!DB_URL)return Response.json({ok:false,state:'FAIL_CLOSED',error:'db_url_unavailable'},{status:503});

  const sql=postgres(pooledDbUrl(),{max:1,connect_timeout:15,idle_timeout:2,max_lifetime:60,prepare:false});
  const started=Date.now();
  try{
    const result=await sql.begin(async tx=>{
      await tx`set local statement_timeout='20s'`;
      const locked=await tx`select pg_try_advisory_xact_lock(hashtextextended('TFA:V180:EMERGENCY:SCHEDULER',0)) as locked`;
      if(!locked[0]?.locked)return{state:'ANOTHER_GOVERNOR_ACTIVE',changed:0,plan:[]};

      await tx`create schema if not exists private`;
      await tx`
        create table if not exists private.v180_emergency_scheduler_baseline(
          jobid bigint primary key,
          jobname text,
          command text not null,
          previous_schedule text not null,
          governed_schedule text not null,
          lane text not null,
          reason text not null,
          captured_at timestamptz not null default now(),
          applied_at timestamptz
        )
      `;
      await tx`revoke all on private.v180_emergency_scheduler_baseline from public,anon,authenticated`;

      const plan:any[]=[];
      let changed=0;
      for(const t of TARGETS){
        const rows=await tx`
          select jobid,jobname,schedule,command,active
          from cron.job
          where active=true and command ilike ${t.pattern}
          order by jobid
        `;
        for(const j of rows){
          await tx`
            insert into private.v180_emergency_scheduler_baseline(
              jobid,jobname,command,previous_schedule,governed_schedule,lane,reason
            ) values(
              ${j.jobid},${j.jobname||''},${j.command},${j.schedule},${t.desired},${t.lane},${t.reason}
            )
            on conflict(jobid) do update set
              jobname=excluded.jobname,
              command=excluded.command,
              governed_schedule=excluded.governed_schedule,
              lane=excluded.lane,
              reason=excluded.reason
          `;
          if(String(j.schedule)!==t.desired){
            await tx`select cron.alter_job(${j.jobid},schedule := ${t.desired})`;
            await tx`update private.v180_emergency_scheduler_baseline set applied_at=coalesce(applied_at,now()) where jobid=${j.jobid}`;
            changed++;
          }
          plan.push({key:t.key,jobid:j.jobid,jobname:j.jobname||null,previous_schedule:j.schedule,governed_schedule:t.desired,lane:t.lane,changed:String(j.schedule)!==t.desired});
        }
      }

      const missing=TARGETS.filter(t=>!plan.some(p=>p.key===t.key)).map(t=>t.key);
      const active=await tx`select count(*)::int as count from cron.job where active=true`;
      return{
        state:missing.length?'PARTIAL_TARGET_DISCOVERY':'SCHEDULE_GOVERNED',
        changed,missing,active_jobs:active[0]?.count||0,plan
      };
    });

    return Response.json({
      ok:true,version:'v180.1-emergency-scheduler-governor-v1',generated_at:new Date().toISOString(),
      duration_ms:Date.now()-started,...result,
      governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,external_execution:false,automatic_capital_promotion:false,rollback_snapshot_preserved:true}
    },{headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180-RECOVERY'}});
  }catch(error){
    console.error('V180_EMERGENCY_SCHEDULER_ERROR',String(error).slice(0,500));
    return Response.json({
      ok:false,version:'v180.1-emergency-scheduler-governor-v1',state:'FAIL_CLOSED',
      error:'scheduler_load_shed_unavailable',detail:String(error).slice(0,220),
      governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,external_execution:false}
    },{status:503,headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180-RECOVERY'}});
  }finally{
    await sql.end({timeout:1}).catch(()=>{});
  }
});
