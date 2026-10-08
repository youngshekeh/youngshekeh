import postgres from "npm:postgres@3.4.7";

const AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const DB_URL=Deno.env.get('SUPABASE_DB_URL')||'';
function pooledDbUrl(){const direct=new URL(DB_URL);const u=new URL('postgres://aws-1-eu-west-1.pooler.supabase.com:6543/postgres');u.username='postgres.mpcelmjiycjpdyyflisn';u.password=decodeURIComponent(direct.password);u.searchParams.set('sslmode','require');return u.toString()}

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
  {key:'CONTRACT_RESOLUTION',pattern:'%tfa_resolve_all_gold_contracts%',desired:'0-59/5 * * * *',lane:'CORE_STATE',reason:'Resolve bounded internal Gold contracts every five minutes during recovery.'},
  {key:'EXPOSURE_REFRESH',pattern:'%tfa_refresh_gold_exposure_objects%',desired:'1-59/5 * * * *',lane:'CORE_STATE',reason:'Refresh exposure objects one minute after contract resolution.'},
  {key:'PERMISSION_COMPILE',pattern:'%tfa_gold_compile_permission_v1%',desired:'1-59/2 * * * *',lane:'SAFETY',reason:'Keep permission compilation frequent and phase-separated; stale permission remains fail-closed.'},
  {key:'V123_TRANSITIONS',pattern:'%detect_v123_gold_transitions%',desired:'0-59/2 * * * *',lane:'SIGNAL',reason:'Keep transition detection frequent on the opposite two-minute phase.'},
  {key:'V191_EVENT_CAPTURE',pattern:'%runtime-v191-gold-signal-event-capture%',desired:'2-59/5 * * * *',lane:'EVENT_CAPTURE',reason:'Observational signal-event capture can run every five minutes during recovery.'},

  {key:'V80_ENQUEUE',pattern:'%enqueue_v80_state_machine_probe%',desired:'0-59/2 * * * *',lane:'SAFETY',reason:'Critical state-machine capture remains two-minute.'},
  {key:'V80_RECONCILE',pattern:'%reconcile_v80_state_machine_probes%',desired:'1-59/2 * * * *',lane:'SAFETY',reason:'Critical state-machine reconciliation is phase-separated.'},
  {key:'V86_PERMISSION',pattern:'%refresh_v86_capital_permission%',desired:'1-59/3 * * * *',lane:'SAFETY',reason:'Capital permission remains frequent; stale state is conservative.'},
  {key:'V119_ENQUEUE',pattern:'%enqueue_v119_gold_desk_probe%',desired:'0-59/2 * * * *',lane:'SAFETY',reason:'Gold Desk capture remains two-minute.'},
  {key:'V119_RECONCILE',pattern:'%reconcile_v119_gold_desk_probes%',desired:'1-59/2 * * * *',lane:'SAFETY',reason:'Gold Desk reconciliation is phase-separated.'},
  {key:'V136_FIREWALL',pattern:'%refresh_v136_gold_execution_firewall%',desired:'3-59/5 * * * *',lane:'SAFETY',reason:'Execution firewall stays frequent; stale state never grants execution.'},
  {key:'V72_LOAD_SHED',pattern:'%enforce_v72_edge_load_shedding%',desired:'4-59/5 * * * *',lane:'SAFETY',reason:'Load-shedding supervision remains five-minute.'},

  {key:'V84_RESEARCH_ENQUEUE',pattern:'%enqueue_v84_research_components%',desired:'0-59/10 * * * *',lane:'RESEARCH',reason:'Research capture can tolerate a ten-minute recovery cadence.'},
  {key:'V84_RESEARCH_RECONCILE',pattern:'%reconcile_v84_research_components%',desired:'1-59/10 * * * *',lane:'RESEARCH',reason:'Research reconciliation is staggered after capture.'},
  {key:'V85_RESEARCH_EVAL',pattern:'%evaluate_v85_research_commands%',desired:'2-59/10 * * * *',lane:'RESEARCH',reason:'Research command evaluation is non-execution-critical.'},
  {key:'V132_SHADOW_TRADER',pattern:'%refresh_v132_gold_shadow_trader%',desired:'3-59/10 * * * *',lane:'SHADOW',reason:'Shadow trading remains simulated and can be slowed safely.'},
  {key:'V133_SHADOW_PORTFOLIO',pattern:'%refresh_v133_gold_shadow_portfolio%',desired:'4-59/10 * * * *',lane:'SHADOW',reason:'Shadow portfolio refresh is non-capital-bearing.'},
  {key:'V137_ADAPTIVE_PAPER',pattern:'%refresh_v137_gold_adaptive_paper_portfolio%',desired:'5-59/10 * * * *',lane:'PAPER',reason:'Paper portfolio adaptation is not a live-capital path.'},
  {key:'V1371_PAPER_CONSENSUS',pattern:'%refresh_v1371_gold_paper_risk_consensus%',desired:'6-59/10 * * * *',lane:'PAPER',reason:'Paper risk consensus can run at ten-minute cadence.'},
  {key:'V136_PAPER_LEDGER',pattern:'%refresh_v136_gold_paper_portfolio_ledger%',desired:'7-59/10 * * * *',lane:'PAPER',reason:'Paper ledger refresh is not execution-critical.'},
  {key:'V136_EXEC_REALITY',pattern:'%refresh_v133_gold_execution_reality%',desired:'8-59/10 * * * *',lane:'QA',reason:'Execution reality is observational while live routing is locked.'},
  {key:'V136_EXEC_QUAL',pattern:'%refresh_v136_gold_execution_qualification%',desired:'9-59/10 * * * *',lane:'QA',reason:'Qualification refresh can be slower while live execution is gated.'},

  {key:'V76_DQ_ENQUEUE',pattern:'%enqueue_v76_data_quality_probe%',desired:'0-59/10 * * * *',lane:'QUALITY',reason:'Data-quality probes are staggered to protect database health.'},
  {key:'V76_DQ_RECONCILE',pattern:'%reconcile_v76_data_quality_probes%',desired:'2-59/10 * * * *',lane:'QUALITY',reason:'Data-quality reconciliation follows capture.'},
  {key:'V89_MARKET_ENQUEUE',pattern:'%enqueue_v89_market_probe%',desired:'4-59/10 * * * *',lane:'MARKET_QA',reason:'Market QA probes are observational.'},
  {key:'V89_MARKET_RECONCILE',pattern:'%reconcile_v89_market_probes%',desired:'6-59/10 * * * *',lane:'MARKET_QA',reason:'Market QA reconciliation is phase-staggered.'},
  {key:'V122_OUTCOMES',pattern:'%resolve_v122_gold_desk_outcomes%',desired:'8-59/10 * * * *',lane:'LEARNING',reason:'Outcome settlement can run at ten-minute cadence.'},
  {key:'V125_REPUTATION',pattern:'%refresh_v125_gold_signal_reputation%',desired:'0-59/15 * * * *',lane:'LEARNING',reason:'Signal reputation is a learning layer, not a live gate.'},
  {key:'V127_REVIEW',pattern:'%refresh_v127_gold_review_intelligence%',desired:'1-59/15 * * * *',lane:'REVIEW',reason:'Review intelligence can run at fifteen-minute cadence.'},
  {key:'V128_DISAGREEMENT',pattern:'%refresh_v128_gold_disagreement_intelligence%',desired:'2-59/15 * * * *',lane:'REVIEW',reason:'Disagreement analytics are non-execution-critical.'},
  {key:'V129_CONTEXT',pattern:'%refresh_v129_gold_contextual_disagreement_intelligence%',desired:'3-59/15 * * * *',lane:'REVIEW',reason:'Contextual disagreement analytics can be slowed safely.'},
  {key:'V130_PRIORITIES',pattern:'%refresh_v130_gold_review_priorities%',desired:'4-59/15 * * * *',lane:'REVIEW',reason:'Review priority routing can run at fifteen-minute cadence.'},
  {key:'V131_LATENCY',pattern:'%refresh_v131_gold_review_response_latency%',desired:'5-59/15 * * * *',lane:'REVIEW',reason:'Review latency telemetry is noncritical.'},
  {key:'V74_PUBLIC_STATE',pattern:'%refresh_v74_autonomous_stack_public_state%',desired:'6-59/15 * * * *',lane:'PUBLIC_CACHE',reason:'Public state is a cache, not an authority source.'},
  {key:'AUTONOMOUS_STATE',pattern:'%refresh_autonomous_machine_state%',desired:'7-59/15 * * * *',lane:'PUBLIC_CACHE',reason:'Aggregate autonomous state can lag while source gates remain authoritative.'},
  {key:'V96_ATTRIBUTION',pattern:'%refresh_v96_forecast_error_attribution%',desired:'8-59/15 * * * *',lane:'LEARNING',reason:'Forecast attribution is an offline learning layer.'},
  {key:'V97_LATENCY',pattern:'%refresh_v97_execution_latency_quality%',desired:'9-59/15 * * * *',lane:'LEARNING',reason:'Latency quality analytics can run slower during recovery.'},
  {key:'V98_SCENARIO_EV',pattern:'%refresh_v98_scenario_ev_proxy%',desired:'10-59/15 * * * *',lane:'LEARNING',reason:'Scenario EV proxy is analytical, not execution authority.'},
  {key:'V99_PORTFOLIO_RISK',pattern:'%refresh_v99_portfolio_risk_readiness%',desired:'11-59/15 * * * *',lane:'LEARNING',reason:'Portfolio risk readiness remains advisory while capital permission is 0R.'},
  {key:'V138_CHALLENGER',pattern:'%refresh_v138_gold_risk_challenger_evaluation%',desired:'12-59/15 * * * *',lane:'LEARNING',reason:'Risk challenger evaluation is shadow learning.'},
  {key:'V107_PROVENANCE',pattern:'%record_v107_provenance_receipts%',desired:'13-59/15 * * * *',lane:'PROVENANCE',reason:'Provenance receipt batching can be slower during recovery.'},
  {key:'V108_ATTEST',pattern:'%record_v108_provenance_attestations%',desired:'14-59/15 * * * *',lane:'PROVENANCE',reason:'Provenance attestations can be batched.'},
  {key:'V110_CHECKPOINT',pattern:'%record_v110_provenance_checkpoint%',desired:'0-59/30 * * * *',lane:'PROVENANCE',reason:'Provenance checkpoints can run every thirty minutes during recovery.'}
]

Deno.serve(async(req:Request)=>{
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401});
  if(!DB_URL)return Response.json({ok:false,state:'FAIL_CLOSED',error:'db_url_unavailable'},{status:503});

  const sql=postgres(pooledDbUrl(),{max:1,connect_timeout:15,idle_timeout:2,max_lifetime:60,prepare:false});
  const started=Date.now();
  try{
    const result=await sql.begin(async tx=>{
      await tx`set local statement_timeout='30s'`;
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
      ok:true,version:'v180.4-emergency-scheduler-governor-v1',generated_at:new Date().toISOString(),
      duration_ms:Date.now()-started,...result,
      governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,external_execution:false,automatic_capital_promotion:false,rollback_snapshot_preserved:true}
    },{headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180-RECOVERY'}});
  }catch(error){
    console.error('V180_EMERGENCY_SCHEDULER_ERROR',String(error).slice(0,500));
    return Response.json({
      ok:false,version:'v180.4-emergency-scheduler-governor-v1',state:'FAIL_CLOSED',
      error:'scheduler_load_shed_unavailable',detail:String(error).slice(0,220),
      governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_routing:false,external_execution:false}
    },{status:503,headers:{'Cache-Control':'no-store','X-TFA-Engine':'V180-RECOVERY'}});
  }finally{
    await sql.end({timeout:1}).catch(()=>{});
  }
});
