import { getVercelOidcToken } from '@vercel/oidc';

const TARGET='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v145-admission-shadow';

const TARGETS=[
  {
    jobname:'tfa-production-smoke-sweep',
    recommended_schedule:'6,21,36,51 * * * *',
    lane:'OBSERVABILITY',
    rationale:'Move production smoke checks away from quarter-hour launch walls while preserving a 15-minute cadence.'
  },
  {
    jobname:'tfa-enterprise-monitor-evaluator',
    recommended_schedule:'8,23,38,53 * * * *',
    lane:'OBSERVABILITY',
    rationale:'Preserve monitoring frequency while separating enterprise evaluation from market capture and command snapshots.'
  },
  {
    jobname:'tfa-v71-shadow-observation',
    recommended_schedule:'9,24,39,54 * * * *',
    lane:'SHADOW_OBSERVATION',
    rationale:'Keep shadow observation quarter-hourly but move it away from :00/:15/:30/:45 collision peaks.'
  }
];

function failClosed(res,status,error,detail){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Engine','V146');
  return res.status(status).json({
    ok:false,
    version:'v146-peak-minute-spreader-shadow-v1',
    state:'FAIL_CLOSED',
    error,
    detail:detail?String(detail).slice(0,180):undefined,
    governance:{
      action_permitted:'WAIT',
      capital_permission:'0R',
      live_order_routing:false,
      automatic_rescheduling:false,
      automatic_policy_promotion:false,
      recommendations_are_advisory_only:true
    }
  });
}

export default async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return failClosed(res,405,'method_not_allowed');
  }

  let oidcToken='';
  try{ oidcToken=await getVercelOidcToken(); }catch{}
  if(!oidcToken)return failClosed(res,503,'vercel_workload_identity_unavailable');

  try{
    const upstream=await fetch(TARGET,{
      headers:{
        Authorization:`Bearer ${oidcToken}`,
        Accept:'application/json',
        'User-Agent':'THE-FATHER-ANALYTICS-V146-PEAK-SPREADER/1.0'
      },
      cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    const admission=await upstream.json().catch(()=>null);
    if(!upstream.ok||!admission?.ok){
      return failClosed(res,upstream.status||503,'v145_admission_shadow_unavailable');
    }

    const groups=Array.isArray(admission.cadence_groups)?admission.cadence_groups:[];
    const quarterHourGroup=groups.find(g=>g?.schedule==='*/15 * * * *');
    const jobs=Array.isArray(quarterHourGroup?.jobs)?quarterHourGroup.jobs:[];
    const byName=new Map(jobs.map(j=>[j.jobname,j]));

    const recommendations=TARGETS.map(target=>{
      const source=byName.get(target.jobname);
      return {
        ...target,
        found:Boolean(source),
        current_schedule:quarterHourGroup?.schedule??null,
        source_runtime_p95_ms:source?.p95_ms_24h??null,
        source_failures_24h:source?.failures_24h??null,
        source_network_call:source?.network_call??null,
        source_nested_public_call:source?.nested_public_call??null,
        apply:false,
        requires_human_review:true
      };
    });

    const found=recommendations.filter(x=>x.found).length;
    const recentHot=Array.isArray(admission.post_v144_hot_minutes)?admission.post_v144_hot_minutes:[];
    const quarterHot=recentHot.filter(x=>{
      const d=new Date(x.minute);
      return Number.isFinite(d.getTime())&&[0,15,30,45].includes(d.getUTCMinutes());
    });
    const maxObservedStarts=recentHot.reduce((m,x)=>Math.max(m,Number(x.starts)||0),0);
    const maxQuarterHourStarts=quarterHot.reduce((m,x)=>Math.max(m,Number(x.starts)||0),0);

    let state='INSUFFICIENT_EVIDENCE';
    if(found===TARGETS.length&&quarterHourGroup)state='REVIEW_READY';

    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-TFA-Runtime','VERCEL_SHADOW_PLANNER');
    res.setHeader('X-TFA-Auth','VERCEL_OIDC');
    res.setHeader('X-TFA-Engine','V146');
    return res.status(200).json({
      ok:true,
      version:'v146-peak-minute-spreader-shadow-v1',
      generated_at:new Date().toISOString(),
      state,
      truth_label:'SHADOW_SCHEDULER_RECOMMENDATION_NOT_AUTOMATIC_RESCHEDULING',
      source:{
        engine:admission.version??null,
        admission_state:admission.state??null,
        active_jobs:admission.summary?.active_jobs??null,
        review_required_groups:admission.summary?.review_required_groups??null,
        recommended_concurrent_ceiling:admission.summary?.recommended_concurrent_ceiling??8
      },
      observation:{
        max_observed_starts_per_minute:maxObservedStarts||null,
        max_quarter_hour_starts_per_minute:maxQuarterHourStarts||null,
        target_jobs_found:found,
        target_jobs_expected:TARGETS.length,
        expected_peak_start_relief_if_approved:found,
        note:'Expected relief is a launch-count estimate only. It is not a guaranteed concurrency or latency reduction.'
      },
      recommendations,
      promotion_gate:{
        automatic_apply:false,
        requires_human_review:true,
        requires_rollback_plan:true,
        requires_post_change_observation:true,
        minimum_observation_minutes:60,
        success_criteria:[
          'no schedule drift outside approved targets',
          'no increase in cron failures',
          'quarter-hour peak starts lower than pre-change observation',
          'capital permission remains 0R',
          'live order routing remains false'
        ]
      },
      governance:{
        action_permitted:'WAIT',
        capital_permission:'0R',
        live_order_routing:false,
        automatic_rescheduling:false,
        automatic_policy_promotion:false,
        recommendations_are_advisory_only:true,
        scheduler_analysis_can_unlock_capital:false
      }
    });
  }catch(error){
    return failClosed(res,503,'peak_spreader_shadow_unavailable',error);
  }
}
