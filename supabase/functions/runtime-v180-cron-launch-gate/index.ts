import postgres from "npm:postgres@3.4.7";

const AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const DB_URL=Deno.env.get('SUPABASE_DB_URL')||'';
const PROJECT='mpcelmjiycjpdyyflisn';

function eq(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;
}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;
  if(SERVICE_ROLE&&eq(token,SERVICE_ROLE))return true;
  try{
    const r=await fetch(AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(4000)});
    const b=await r.json().catch(()=>null);
    return r.ok&&b?.ok===true&&b?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}
function urls(){
  if(!DB_URL)return[];
  const direct=new URL(DB_URL);
  const password=decodeURIComponent(direct.password);
  const mk=(label:string,host:string,port:string,user:string)=>{
    const u=new URL(`postgres://${host}:${port}/postgres`);
    u.username=user;u.password=password;u.searchParams.set('sslmode','require');
    return{label,url:u.toString()};
  };
  return[
    {label:'DIRECT',url:DB_URL},
    mk('DEDICATED_TX',`db.${PROJECT}.supabase.co`,'6543','postgres'),
    mk('SHARED_SESSION','aws-1-eu-west-1.pooler.supabase.com','5432',`postgres.${PROJECT}`),
    mk('SHARED_TX','aws-1-eu-west-1.pooler.supabase.com','6543',`postgres.${PROJECT}`)
  ];
}
async function attempt(mode:string){
  const errors:any[]=[];
  for(const target of urls()){
    const sql=postgres(target.url,{max:1,prepare:false,connect_timeout:2,idle_timeout:1,max_lifetime:15});
    try{
      await sql`set statement_timeout='5s'`;
      if(mode==='off'){
        await sql.unsafe("alter system set cron.launch_active_jobs = 'off'");
        await sql`select pg_reload_conf()`;
      }else if(mode==='on'){
        const gate=await sql`
          select
            to_regclass('private.v180_kernel_seal_receipt') is not null as table_exists,
            case
              when to_regclass('private.v180_kernel_seal_receipt') is null then false
              else exists(select 1 from private.v180_kernel_seal_receipt where seal_key='V180_KERNEL_SEAL')
            end as sealed
        `;
        if(!gate?.[0]?.table_exists||!gate?.[0]?.sealed){
          return{ok:false,state:'SEAL_REQUIRED',route:target.label};
        }
        await sql.unsafe("alter system set cron.launch_active_jobs = 'on'");
        await sql`select pg_reload_conf()`;
      }
      const s=await sql`select current_setting('cron.launch_active_jobs') as launch_active_jobs`;
      return{ok:true,state:String(s?.[0]?.launch_active_jobs||'unknown').toUpperCase()==='OFF'?'CRON_QUIESCED':'CRON_ACTIVE',route:target.label,launch_active_jobs:s?.[0]?.launch_active_jobs||null};
    }catch(error){
      errors.push({route:target.label,error:String(error).slice(0,140)});
    }finally{
      await sql.end({timeout:1}).catch(()=>{});
    }
  }
  return{ok:false,state:'NO_DATABASE_ROUTE',errors};
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET'}});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401});
  const mode=(new URL(req.url).searchParams.get('mode')||'status').toLowerCase();
  if(!['status','off','on'].includes(mode))return Response.json({ok:false,error:'invalid_mode'},{status:400});
  if(!DB_URL)return Response.json({ok:false,state:'FAIL_CLOSED',error:'db_url_unavailable'},{status:503});
  const started=Date.now();
  const result=await attempt(mode);
  return Response.json({
    ok:result.ok,
    version:'v180-cron-launch-gate-v1',
    mode,
    generated_at:new Date().toISOString(),
    duration_ms:Date.now()-started,
    ...result,
    governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,order_submission_enabled:false,external_execution:false}
  },{
    status:result.ok?200:result.state==='SEAL_REQUIRED'?409:503,
    headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180-CRON-GATE'}
  });
});