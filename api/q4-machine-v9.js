const ORIGIN='https://thefatheranalytics.com';
const SUPA='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';

async function read(url,timeout=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-V9/1.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await response.json().catch(()=>null);
    return response.ok&&body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null}finally{clearTimeout(timer)}
}

function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clean(value,fallback='WITHHELD'){return String(value??fallback)}
function yes(value){return value===true}
async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function blockerKeys(v8){
  const gates=Array.isArray(v8?.orchestrator?.gates)?v8.orchestrator.gates:[];
  return gates.filter(g=>g?.passed!==true).map(g=>String(g?.key??'unknown'));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-CONTRACT-READINESS-WATCH-V9');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [v8,permission,trigger,learning]=await Promise.all([
    read(ORIGIN+'/api/q4-machine-v8',16000),
    read(SUPA+'/public-gold-permission-transitions'),
    read(SUPA+'/public-gold-trigger-watch'),
    read(SUPA+'/public-gold-learning-state')
  ]);

  const sourceHealth={
    v8:v8?.ok===true,
    permission_transitions:permission?.ok===true,
    trigger_watch:trigger?.ok===true,
    learning_state:learning?.ok===true
  };

  const blockers=blockerKeys(v8);
  const orchestratorState=clean(v8?.orchestrator?.state,'SOURCE_GATED');
  const candidateId=v8?.candidate?.candidate_id??null;
  const permissionCurrent=permission?.current??{};
  const latestTransition=permission?.latest_transition??null;
  const captureState=clean(learning?.capture_health?.state,'SOURCE_UNAVAILABLE');
  const triggerState=clean(trigger?.state,'SOURCE_UNAVAILABLE');
  const brokerGate=(v8?.orchestrator?.gates??[]).find(g=>g?.key==='real_broker_quote_present')??null;
  const v7Gate=(v8?.orchestrator?.gates??[]).find(g=>g?.key==='v7_prerequisites_reviewable')??null;

  const sourceUnknown=Object.values(sourceHealth).filter(v=>!v).length;
  const captureHealthy=captureState==='HEALTHY';
  const brokerReady=brokerGate?.passed===true;
  const upstreamReviewable=v7Gate?.passed===true;
  const candidateReady=orchestratorState==='CANDIDATE_PREPARATION_REVIEWABLE'&&candidateId!==null;

  const fingerprintPayload=[
    orchestratorState,
    blockers.join(','),
    candidateId,
    clean(permissionCurrent?.final_action),
    clean(permissionCurrent?.final_permission),
    clean(permissionCurrent?.data_gate),
    clean(permissionCurrent?.engine_gate),
    clean(permissionCurrent?.contract_gate),
    clean(permissionCurrent?.firewall_gate),
    triggerState,
    clean(trigger?.long_watch?.scenario_state),
    clean(trigger?.short_watch?.scenario_state),
    String(yes(trigger?.long_watch?.acceptance_confirmed)),
    String(yes(trigger?.short_watch?.acceptance_confirmed)),
    String(brokerReady),
    captureState,
    learning?.latest?.payload_sha256??null,
    latestTransition?.id??latestTransition?.event_id??null,
    latestTransition?.transition_code??null
  ].map(v=>String(v??'NULL')).join('|');

  const hash=await sha256(fingerprintPayload);
  const watchId='Q4V9-'+hash.slice(0,16).toUpperCase();

  const signals=[];
  if(sourceUnknown>0){
    signals.push({
      severity:'HIGH',
      code:'SOURCE_HEALTH_DEGRADED',
      message:String(sourceUnknown)+' required watcher source'+(sourceUnknown===1?' is':'s are')+' unavailable.'
    });
  }
  if(!captureHealthy){
    signals.push({
      severity:'HIGH',
      code:'PROSPECTIVE_CAPTURE_NOT_HEALTHY',
      message:'Prospective learning capture is '+captureState+'.'
    });
  }
  if(candidateReady){
    signals.push({
      severity:'HIGH',
      code:'CANDIDATE_REVIEWABLE',
      message:'V8 has prepared an ephemeral candidate for authoritative review.',
      candidate_id:candidateId
    });
  }else{
    signals.push({
      severity:'INFO',
      code:'CANDIDATE_BLOCKED',
      message:blockers.length
        ?'Candidate remains blocked by '+blockers.join(', ')+'.'
        :'Candidate is not prepared.'
    });
  }
  if(!brokerReady){
    signals.push({
      severity:'MEDIUM',
      code:'BROKER_REFERENCE_MISSING',
      message:'No real-account broker reference is available to the V8 preparation gate.'
    });
  }
  if(sourceHealth.trigger_watch&&(
    yes(trigger?.long_watch?.human_review_condition_reached)||
    yes(trigger?.short_watch?.human_review_condition_reached)
  )){
    signals.push({
      severity:'MEDIUM',
      code:'HUMAN_REVIEW_CONDITION_REACHED',
      message:'A structural review condition is active, but this is not acceptance or executable permission.'
    });
  }
  if(latestTransition){
    signals.push({
      severity:'INFO',
      code:'PERMISSION_TRANSITION_PRESENT',
      message:'The permission transition ledger reports a latest transition event.',
      transition_code:latestTransition?.transition_code??null,
      transition_id:latestTransition?.id??latestTransition?.event_id??null
    });
  }

  let watchState='WATCHING_BLOCKED';
  if(sourceUnknown>0||!captureHealthy)watchState='WATCHING_DEGRADED';
  else if(candidateReady)watchState='CANDIDATE_REVIEW_SIGNAL';
  else if(upstreamReviewable)watchState='UPSTREAM_REVIEWABLE_WAITING_CANONICAL_GATES';

  const alertRecommendation=
    watchState==='WATCHING_DEGRADED'
      ?'SOURCE_RECOVERY'
      :watchState==='CANDIDATE_REVIEW_SIGNAL'
        ?'HUMAN_REVIEW'
        :signals.some(s=>s.code==='HUMAN_REVIEW_CONDITION_REACHED')
          ?'STRUCTURAL_REVIEW'
          :'NO_ACTION';

  return res.status(200).json({
    ok:true,
    version:'q4-machine-v9',
    generated_at:new Date().toISOString(),
    watch:{
      watch_id:watchId,
      state:watchState,
      deterministic_fingerprint_sha256:hash,
      alert_recommendation:alertRecommendation,
      comparison_rule:'Clients may compare watch_id values across polls. A changed watch_id means governed readiness inputs changed; it does not imply a trade signal.',
      candidate_id:candidateId,
      candidate_ready:candidateReady,
      blocker_keys:blockers
    },
    readiness_state:{
      orchestrator_state:orchestratorState,
      v7_upstream_reviewable:upstreamReviewable,
      real_broker_reference_ready:brokerReady,
      prospective_capture_state:captureState,
      trigger_state:triggerState,
      permission:{
        final_action:permissionCurrent?.final_action??'WITHHELD',
        final_permission:permissionCurrent?.final_permission??'0R',
        final_r:finite(permissionCurrent?.final_r),
        data_gate:permissionCurrent?.data_gate??'WITHHELD',
        engine_gate:permissionCurrent?.engine_gate??'WITHHELD',
        contract_gate:permissionCurrent?.contract_gate??'WITHHELD',
        firewall_gate:permissionCurrent?.firewall_gate??'WITHHELD'
      }
    },
    signals,
    transition_context:latestTransition?{
      id:latestTransition?.id??latestTransition?.event_id??null,
      transition_code:latestTransition?.transition_code??null,
      severity:latestTransition?.severity??null,
      generated_at:latestTransition?.generated_at??latestTransition?.created_at??null
    }:null,
    source_health:{
      available_count:Object.values(sourceHealth).filter(Boolean).length,
      total_count:Object.keys(sourceHealth).length,
      sources:sourceHealth
    },
    watch_firewall:{
      state_change_is_not_trade_signal:true,
      alert_is_not_permission:true,
      human_review_does_not_admit_exposure:true,
      no_persistence:true,
      no_gate_mutation:true,
      no_capital_promotion:true,
      no_orders:true
    },
    decision_compression:{
      what_changed:'V9 fingerprinted the current canonical-readiness state as '+watchId+'.',
      what_matters_now:candidateReady
        ?'An ephemeral candidate is reviewable by the authoritative workflow.'
        :blockers.length
          ?'Primary blockers remain '+blockers.join(', ')+'.'
          :'No candidate is currently prepared.',
      action_permitted:'WAIT',
      capital_permission:'0R'
    },
    governance:{
      research_only:true,
      read_only_watch:true,
      automatic_execution:false,
      action_permitted:'WAIT',
      capital_permission:'0R'
    }
  });
}
