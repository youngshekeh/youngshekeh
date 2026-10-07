
const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';
const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const APP='https://thefatheranalytics.com';
const SOURCES=[
  ['closure','Production Closure','/api/production-closure',true],
  ['q4','Q4 Readiness Watch','/api/q4-machine-v9',true],
  ['autonomous','Autonomous State','/api/autonomous-state',false],
  ['quality','Data Quality','/api/data-quality-sentinel',true],
  ['gold','Gold Live','/api/gold-live-price',false],
  ['day','Gold Day State','/api/gold-day-state',false],
  ['calendar','Macro Calendar','/api/capital-calendar',false]
];

function constantTimeEqual(a:string,b:string){if(!a||!b||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function authorized(req:Request){
  const auth=req.headers.get('authorization')||'',token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;
  if(SERVICE_ROLE&&constantTimeEqual(token,SERVICE_ROLE))return true;
  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{headers:{Authorization:auth,Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    const b=await r.json().catch(()=>null);
    return r.ok&&b?.ok===true&&b?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}
function headers(){return{apikey:SERVICE_ROLE,Authorization:`Bearer ${SERVICE_ROLE}`,Accept:'application/json','Content-Type':'application/json'}}
async function dbRows(path:string){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:headers(),signal:AbortSignal.timeout(12000)});
  const b=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(`db_${r.status}_${path.split('?')[0]}`);
  return Array.isArray(b)?b:[];
}
async function upsert(table:string,conflict:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{method:'POST',headers:{...headers(),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(12000)});
  if(!r.ok){const body=await r.text().catch(()=>'' );throw new Error(`upsert_${table}_${r.status}_${body.slice(0,220)}`);}
}
async function insertRows(table:string,rows:any[]){
  if(!rows.length)return;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}`,{method:'POST',headers:{...headers(),Prefer:'return=minimal'},body:JSON.stringify(rows),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error(`insert_${table}_${r.status}`);
}
async function patchRow(table:string,id:string,patch:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{...headers(),Prefer:'return=minimal'},body:JSON.stringify(patch),signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error(`patch_${table}_${r.status}`);
}
async function source(key:string,name:string,path:string,critical:boolean){
  const started=Date.now();
  try{
    const r=await fetch(APP+path,{headers:{Accept:'application/json','User-Agent':'TFA-V173-EXECUTIVE-CYCLE/1.0'},signal:AbortSignal.timeout(12000)});
    const body=await r.json().catch(()=>null);
    return{key,name,critical,ok:r.ok&&body&&body?.ok!==false,status:r.status,latency:Date.now()-started,data:body};
  }catch(error){return{key,name,critical,ok:false,status:0,latency:Date.now()-started,data:null,error:String(error).slice(0,120)}}
}
function textState(data:any,fallback='UNKNOWN'){const c=[data?.state,data?.status,data?.health?.state,data?.machine_state,data?.decision?.state,data?.watch?.state,data?.desk_state];return String(c.find(v=>v!==undefined&&v!==null&&String(v).trim())??fallback).toUpperCase()}
function severity(value:any){const s=String(value||'').toUpperCase();if(/FAIL|ERROR|UNAVAILABLE|OFFLINE|CRITICAL/.test(s))return'bad';if(/DEGRADED|BLOCK|WAIT|WARN|STALE|WITHHELD|REVIEW|UNKNOWN/.test(s))return'warn';if(/HEALTHY|READY|LIVE|ACTIVE|CLEAR|PASS|OK|OPEN/.test(s))return'good';return'warn'}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:0}
function opt(v:any){return v===null||v===undefined||v===''?null:n(v)}
function clamp(v:number,a:number,b:number){return Math.max(a,Math.min(b,v))}
function dateKey(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Lagos',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(t:string)=>parts.find(p=>p.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`}
function hash(input:string){let h=2166136261;for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16).toUpperCase().padStart(8,'0')}
function outcomeDen(x:any){return Math.max(Math.abs(n(x.expected_value)),Math.abs(n(x.baseline_value)),1e-9)}
function outcomePerf(x:any){
  if(x.status!=='RESOLVED'||opt(x.actual_value)===null)return null;
  const e=n(x.expected_value),a=n(x.actual_value),d=outcomeDen(x);
  if(x.direction==='LOWER_IS_BETTER')return a<=e?100:clamp((Math.abs(e)||d)/(Math.abs(a)||d)*100,0,100);
  if(x.direction==='TARGET')return clamp((1-Math.abs(a-e)/d)*100,0,100);
  return a>=e?100:clamp(a/d*100,0,100);
}
function feedback(outcomes:any[],type:string,id:string){const r=outcomes.filter(x=>x.entity_type===type&&x.entity_client_id===id&&x.status==='RESOLVED').map(outcomePerf).filter(x=>x!==null) as number[];return r.length?r.reduce((a,b)=>a+b,0)/r.length:null}
function projectScore(x:any,objectives:any[],outcomes:any[]){const o=objectives.find(v=>v.client_objective_id===x.objective_client_id),p=n(o?.priority)||3,f=feedback(outcomes,'PROJECT',x.client_project_id);let s=n(x.impact)*12+n(x.confidence)*.25+p*6-n(x.effort)*6;if(f!==null)s+=(f-50)*.2;if(x.status==='BLOCKED'||String(x.blocker||'').trim())s-=20;if(x.status==='DEFERRED')s-=25;if(x.due_date&&new Date(x.due_date+'T23:59:59Z').getTime()<Date.now()&&!['COMPLETE','KILLED'].includes(x.status))s-=10;return clamp(Math.round(s),0,100)}
function businessScore(x:any,outcomes:any[]){const rev=opt(x.revenue_30d),cost=opt(x.cost_30d),growth=opt(x.growth_pct),f=feedback(outcomes,'BUSINESS',x.client_business_id),margin=rev!==null&&rev>0&&cost!==null?(rev-cost)/rev*100:null;let s=n(x.strategic_priority)*12+(x.status==='ACTIVE'?12:x.status==='INCUBATING'?6:0)+(growth===null?0:clamp(growth,-50,50)*.25)+(margin===null?0:clamp(margin,-100,100)*.18)+(x.next_action?4:0);if(f!==null)s+=(f-50)*.2;if(x.blocker)s-=18;if(x.status==='EXIT_REVIEW')s-=20;if(x.status==='PAUSED')s-=15;return clamp(Math.round(s),0,100)}
function focusScore(projects:any[]){const a=projects.filter(x=>['ACTIVE','PLANNED','BLOCKED'].includes(x.status)),blocked=a.filter(x=>x.status==='BLOCKED'||String(x.blocker||'').trim()),overdue=a.filter(x=>x.due_date&&new Date(x.due_date+'T23:59:59Z').getTime()<Date.now()),low=a.filter(x=>n(x.confidence)<40),unlinked=a.filter(x=>!x.objective_client_id);return clamp(100-Math.max(0,a.length-5)*8-blocked.length*15-overdue.length*8-low.length*8-unlinked.length*4,0,100)}
function snapRows(data:any,sources:any){
  return{
    sources:Object.fromEntries(sources.map((r:any)=>[r.key,{ok:!!r.ok,state:r.ok?textState(r.data,'RESPONDING'):'OFFLINE',status:r.status||0}])),
    decisions:data.decisions.map((x:any)=>[x.client_decision_id,x.status,x.outcome,String(x.confidence),x.updated_at||x.client_created_at]),
    objectives:data.objectives.map((x:any)=>[x.client_objective_id,x.status,String(x.priority),x.current_value||'',x.updated_at||x.client_created_at]),
    projects:data.projects.map((x:any)=>[x.client_project_id,x.status,String(x.impact),String(x.effort),String(x.confidence),String(x.allocation_weight),x.blocker||'',x.updated_at||x.client_created_at]),
    businesses:data.businesses.map((x:any)=>[x.client_business_id,x.status,String(x.strategic_priority),x.revenue_30d==null?'':String(x.revenue_30d),x.cost_30d==null?'':String(x.cost_30d),x.growth_pct==null?'':String(x.growth_pct),x.blocker||'',x.updated_at||x.client_created_at]),
    products:data.products.map((x:any)=>[x.client_product_id,x.status,String(x.strategic_priority),x.revenue_30d==null?'':String(x.revenue_30d),x.conversion_pct==null?'':String(x.conversion_pct),x.margin_pct==null?'':String(x.margin_pct),x.blocker||'',x.updated_at||x.client_created_at]),
    channels:data.channels.map((x:any)=>[x.client_channel_id,x.status,x.leads_30d==null?'':String(x.leads_30d),x.conversions_30d==null?'':String(x.conversions_30d),x.revenue_30d==null?'':String(x.revenue_30d),x.cost_30d==null?'':String(x.cost_30d),x.updated_at||x.client_created_at]),
    allocations:data.allocations.map((x:any)=>[x.client_allocation_id,x.status,!!x.human_approved,x.allocation_type,x.weight_pct==null?'':String(x.weight_pct),x.amount==null?'':String(x.amount),x.updated_at||x.client_created_at]),
    outcomes:data.outcomes.map((x:any)=>[x.client_outcome_id,x.status,String(x.expected_value),x.actual_value==null?'':String(x.actual_value),x.due_at,x.resolved_at,x.updated_at||x.client_created_at])
  };
}
function buildCycle(userId:string,data:any,sources:any,existing:any){
  const date=dateKey(),snap=snapRows(data,sources);
  const closure=sources.find((x:any)=>x.key==='closure'),g=closure?.ok?{action:String(closure.data?.governance?.action_permitted||'WAIT').toUpperCase(),capital:String(closure.data?.governance?.capital_permission||'0R').toUpperCase()}:{action:'WAIT',capital:'0R'};
  const healthy=sources.filter((r:any)=>r.ok&&severity(textState(r.data))==='good').length,healthPct=Math.round(healthy/SOURCES.length*100),focus=focusScore(data.projects);
  const anomalies:any[]=[],push=(severityN:number,code:string,title:string,copy:string,action:string,type='OPERATING')=>anomalies.push({severity:severityN,code,title,copy,action,type});
  if(!closure?.ok)push(100,'SOVEREIGN_GATE_OFFLINE','Sovereign gate unavailable','Production closure cannot be read. Capital-bearing decisions remain WAIT / 0R.','Restore production closure visibility before any execution promotion.','GOVERNANCE');
  for(const r of sources.filter((x:any)=>x.critical&&x.key!=='closure'&&!x.ok))push(92,`CRITICAL_SOURCE_${String(r.key).toUpperCase()}`,r.name+' unavailable','A critical command source is offline or unreadable.','Restore '+r.name+' observability and preserve fail-closed behavior.','SYSTEM');
  if(healthPct<50)push(88,'LOW_MACHINE_HEALTH','Machine health below 50%',`Only ${healthy} of ${SOURCES.length} sources are healthy by command-state classification.`,'Repair observability before expanding autonomy.','SYSTEM');
  const blocked=data.projects.filter((x:any)=>x.status==='BLOCKED'||String(x.blocker||'').trim()).sort((a:any,b:any)=>projectScore(b,data.objectives,data.outcomes)-projectScore(a,data.objectives,data.outcomes));
  blocked.slice(0,3).forEach((x:any,i:number)=>push(82-i,'PROJECT_BLOCKED_'+x.client_project_id,x.title,`Blocked project with priority score ${projectScore(x,data.objectives,data.outcomes)}/100. ${x.blocker||'Constraint unspecified.'}`,'Remove or explicitly accept the blocker before assigning more work.','ORGANIZATION'));
  const overdue=data.outcomes.filter((x:any)=>['PLANNED','RUNNING'].includes(x.status)&&x.due_at&&new Date(x.due_at).getTime()<Date.now());
  overdue.slice(0,3).forEach((x:any,i:number)=>push(84-i,'OUTCOME_OVERDUE_'+x.client_outcome_id,x.title,'Measurement deadline passed without a resolved actual value.','Record the actual outcome or cancel the experiment so learning does not stall.','LEARNING'));
  const activeProjects=data.projects.filter((x:any)=>['ACTIVE','PLANNED','BLOCKED'].includes(x.status)),weights=activeProjects.reduce((s:number,x:any)=>s+n(x.allocation_weight),0);
  if(weights>100)push(79,'ATTENTION_OVERCOMMITTED','Project attention exceeds 100%',`Declared project attention totals ${weights}%.`,'Reduce active attention weights until the portfolio fits inside 100%.','ORGANIZATION');
  const monetary=data.allocations.filter((x:any)=>x.status==='PROPOSED'&&!x.human_approved&&opt(x.amount)!==null);
  if(monetary.length)push(76,'MONEY_PROPOSALS_PENDING',`${monetary.length} monetary proposal${monetary.length===1?' awaits':'s await'} review`,'Money proposals remain planning records until human approval.','Approve, reject or defer each proposal. No funds move automatically.','HUMAN');
  for(const x of data.businesses.filter((x:any)=>x.status==='ACTIVE')){const rev=opt(x.revenue_30d),cost=opt(x.cost_30d),growth=opt(x.growth_pct);if(rev!==null&&cost!==null&&cost>rev)push(69,'NEGATIVE_UNIT_MARGIN_'+x.client_business_id,x.name+' is spending above 30D revenue','Recorded cost exceeds recorded revenue.','Inspect cost structure and verify the measurement window before increasing resources.','BUSINESS');if(growth!==null&&growth<0)push(63,'NEGATIVE_GROWTH_'+x.client_business_id,x.name+' growth is negative',`Recorded 30-day growth is ${growth}%.`,'Diagnose retention, conversion and distribution before adding acquisition spend.','BUSINESS')}
  for(const x of data.channels.filter((x:any)=>x.status==='ACTIVE')){const rev=opt(x.revenue_30d),cost=opt(x.cost_30d);if(rev!==null&&cost!==null&&cost>0&&rev<cost)push(61,'CHANNEL_NEGATIVE_ROI_'+x.client_channel_id,x.name+' has negative observed channel ROI','30-day revenue is below recorded channel cost.','Review attribution and pause scaling until economics improve.','DISTRIBUTION')}
  const stale=data.decisions.filter((x:any)=>x.status==='OPEN'&&Date.now()-new Date(x.client_created_at).getTime()>7*864e5);if(stale.length)push(56,'STALE_DECISIONS',`${stale.length} open decision${stale.length===1?' is':'s are'} older than 7 days`,'Old unresolved decisions create hidden cognitive inventory.','Resolve, defer or delete stale decisions.','DECISION');
  if(activeProjects.length>0&&!data.outcomes.some((x:any)=>['PLANNED','RUNNING'].includes(x.status)))push(58,'MEASUREMENT_DEBT','Active work has no running measurement loop','Projects are moving without a frozen expected outcome.','Attach at least one measurable outcome to the highest-priority active work.','LEARNING');
  if(g.action!=='WAIT'||g.capital!=='0R')push(70,'PERMISSION_CHANGED','Sovereign permission is no longer baseline WAIT / 0R',`Current authority reads ${g.action} / ${g.capital}.`,'Require human review of the upstream evidence before treating any permission change as actionable.','GOVERNANCE');
  anomalies.sort((a,b)=>b.severity-a.severity);
  const interventions=anomalies.slice(0,3).map(x=>({priority:x.severity,title:x.action,reason:x.title,type:x.type}));
  if(!interventions.length)interventions.push({priority:20,title:'Preserve focus and continue observation',reason:'No anomaly currently earns intervention. Silence is a valid machine output.',type:'STEWARD'});
  const q4=sources.find((x:any)=>x.key==='q4')?.data,human:any[]=[];
  if(q4?.watch?.candidate_ready===true)human.push({priority:95,title:'Review governed market candidate',copy:'Candidate readiness is reviewable, but review does not grant exposure.'});
  data.allocations.filter((x:any)=>x.status==='PROPOSED'&&!x.human_approved).slice(0,3).forEach((x:any)=>{const p=data.products.find((v:any)=>v.client_product_id===x.product_client_id),b=data.businesses.find((v:any)=>v.client_business_id===x.business_client_id),target=p?.name||b?.name||x.allocation_type;human.push({priority:opt(x.amount)!==null?90:72,title:'Approve / reject '+target+' resource proposal',copy:x.rationale||'Human approval is required before activation.'})});
  data.businesses.filter((x:any)=>x.status==='EXIT_REVIEW').forEach((x:any)=>human.push({priority:85,title:'Decide whether to exit '+x.name,copy:'Business unit is explicitly in EXIT REVIEW.'}));
  data.products.filter((x:any)=>x.status==='KILL_REVIEW').forEach((x:any)=>human.push({priority:82,title:'Decide whether to kill '+x.name,copy:'Product is explicitly in KILL REVIEW.'}));
  const hb=blocked.find((x:any)=>projectScore(x,data.objectives,data.outcomes)>=70);if(hb)human.push({priority:78,title:'Resolve founder-level blocker: '+hb.title,copy:hb.blocker||'High-priority work is blocked.'});human.sort((a,b)=>b.priority-a.priority);
  const activeBiz=data.businesses.filter((x:any)=>x.status==='ACTIVE').map((x:any)=>({x,score:Math.max(1,businessScore(x,data.outcomes))}));const sum=activeBiz.reduce((s:number,x:any)=>s+x.score,0);
  const realloc=activeBiz.sort((a:any,b:any)=>b.score-a.score).slice(0,5).map((v:any)=>({target:v.x.name,weight:Number((sum?v.score/sum*100:0).toFixed(1)),score:v.score,copy:'Suggested attention share based on current business score and resolved outcome evidence. Advisory only.'}));
  const semanticState={
    governance:[g.action,g.capital],
    machineHealthPct:healthPct,
    focusScore:focus,
    anomalies:anomalies.map((v:any)=>[v.code,v.severity]),
    interventions:interventions.map((v:any)=>[v.type,v.title]),
    humanDecisions:human.map((v:any)=>[v.priority,v.title]),
    reallocation:realloc.map((v:any)=>[v.target,v.weight,v.score]),
    candidateReady:q4?.watch?.candidate_ready===true
  };
  const fingerprint=`CYC-${date}-${hash(JSON.stringify(semanticState))}`;
  const summary=`Executive cycle ${date}: ${anomalies.length} anomal${anomalies.length===1?'y':'ies'}, ${human.length} human decision${human.length===1?'':'s'}, machine health ${healthPct}%, organization focus ${focus}%. Sovereign authority remains ${g.action} / ${g.capital}. Top intervention: ${interventions[0]?.title||'preserve focus'}.`;
  const now=new Date().toISOString(),same=existing&&existing.state_fingerprint===fingerprint,generation=same?n(existing.generation_count)||1:(existing?n(existing.generation_count)+1:1);
  return{user_id:userId,cycle_date:date,version:'V173',state_fingerprint:fingerprint,sovereign_action:g.action,capital_permission:g.capital,machine_health_pct:healthPct,focus_score:focus,summary,anomalies,interventions,reallocation_suggestions:realloc,human_decisions:human.slice(0,5),source_snapshot:snap,generation_count:generation,first_generated_at:existing?.first_generated_at||now,generated_at:same?(existing?.generated_at||now):now,updated_at:same?(existing?.updated_at||now):now,changed:!same};
}

function interventionSignals(cycle:any){
  const signals:any[]=[];
  const seen=new Set<string>();
  const add=(row:any)=>{if(!seen.has(row.intervention_key)){seen.add(row.intervention_key);signals.push(row)}};
  for(const a of cycle.anomalies||[]){
    add({
      intervention_key:'ANOMALY:'+String(a.code||hash(String(a.title||''))),
      source_code:String(a.code||'ANOMALY'),
      title:String(a.title||'Executive anomaly'),
      summary:String(a.copy||''),
      recommended_action:String(a.action||'Review the anomaly.'),
      category:String(a.type||'OPERATING'),
      severity:clamp(n(a.severity)||50,0,100),
      priority:clamp(n(a.severity)||50,0,100),
      approval_required:String(a.type||'').toUpperCase()==='HUMAN',
      evidence:{kind:'ANOMALY',code:a.code||null,cycle_date:cycle.cycle_date,state_fingerprint:cycle.state_fingerprint}
    });
  }
  for(const h of cycle.human_decisions||[]){
    const title=String(h.title||'Human decision');
    add({
      intervention_key:'HUMAN:'+hash(title),
      source_code:'HUMAN_DECISION',
      title,
      summary:String(h.copy||'Owner judgment is required.'),
      recommended_action:title,
      category:'HUMAN',
      severity:clamp(n(h.priority)||75,0,100),
      priority:clamp(n(h.priority)||75,0,100),
      approval_required:true,
      evidence:{kind:'HUMAN_DECISION',cycle_date:cycle.cycle_date,state_fingerprint:cycle.state_fingerprint}
    });
  }
  return signals;
}
async function syncInterventionInbox(userId:string,cycle:any){
  const now=new Date().toISOString();
  const existing=await dbRows('command_interventions?user_id=eq.'+encodeURIComponent(userId)+'&source=eq.EXECUTIVE_CYCLE&select=*');
  const byKey=new Map(existing.map((x:any)=>[x.intervention_key,x]));
  const signals=interventionSignals(cycle);
  const activeKeys=new Set(signals.map((x:any)=>x.intervention_key));
  const events:any[]=[];
  let created=0,reopened=0,reappeared=0,cleared=0,refreshed=0;

  for(const s of signals){
    const prior:any=byKey.get(s.intervention_key);
    if(!prior){
      const id=crypto.randomUUID();
      await upsert('command_interventions','user_id,intervention_key',{
        id,user_id:userId,source:'EXECUTIVE_CYCLE',
        source_cycle_date:cycle.cycle_date,source_fingerprint:cycle.state_fingerprint,source_code:s.source_code,
        title:s.title,summary:s.summary,recommended_action:s.recommended_action,category:s.category,
        severity:s.severity,priority:s.priority,approval_required:s.approval_required,status:'NEW',
        owner_role:'ARCHITECT_STEWARD',evidence:s.evidence,occurrence_count:1,signal_active:true,
        first_seen_at:now,last_seen_at:now,created_at:now,updated_at:now
      });
      events.push({user_id:userId,intervention_id:id,event_type:'DETECTED',from_status:null,to_status:'NEW',actor:'SYSTEM',note:'Executive cycle surfaced a new governed intervention.',evidence:s.evidence,created_at:now});
      created++;
      continue;
    }

    const closed=['RESOLVED','LEARNED'].includes(prior.status);
    const inactive=prior.signal_active===false;
    let status=prior.status,occurrence=n(prior.occurrence_count)||1,eventType='';
    if(closed){status='NEW';occurrence+=1;eventType='REOPENED';reopened++}
    else if(inactive){occurrence+=1;eventType='REAPPEARED';reappeared++}
    else refreshed++;

    await patchRow('command_interventions',prior.id,{
      source_cycle_date:cycle.cycle_date,source_fingerprint:cycle.state_fingerprint,source_code:s.source_code,
      title:s.title,summary:s.summary,recommended_action:s.recommended_action,category:s.category,
      severity:s.severity,priority:s.priority,approval_required:s.approval_required,status,
      evidence:s.evidence,occurrence_count:occurrence,signal_active:true,cleared_at:null,last_seen_at:now
    });
    if(eventType){
      events.push({user_id:userId,intervention_id:prior.id,event_type:eventType,from_status:prior.status,to_status:status,actor:'SYSTEM',note:eventType==='REOPENED'?'A previously closed signal returned and was reopened for review.':'A previously cleared signal returned.',evidence:s.evidence,created_at:now});
    }
  }

  for(const prior of existing){
    if(prior.signal_active===true&&!activeKeys.has(prior.intervention_key)){
      await patchRow('command_interventions',prior.id,{signal_active:false,cleared_at:now,last_seen_at:now});
      events.push({user_id:userId,intervention_id:prior.id,event_type:'SIGNAL_CLEARED',from_status:prior.status,to_status:prior.status,actor:'SYSTEM',note:'The underlying executive signal is no longer active. Workflow state was preserved for explicit resolution and learning.',evidence:{cycle_date:cycle.cycle_date,state_fingerprint:cycle.state_fingerprint},created_at:now});
      cleared++;
    }
  }

  await insertRows('command_intervention_events',events);
  return{
    signals:signals.length,
    created,reopened,reappeared,cleared,refreshed,
    approval_required:signals.filter((x:any)=>x.approval_required).length,
    event_count:events.length
  };
}

async function loadOwner(userId:string){
  const q='user_id=eq.'+encodeURIComponent(userId)+'&select=*';
  const [decisions,objectives,projects,businesses,products,channels,allocations,outcomes,cycles]=await Promise.all([
    dbRows('command_decisions?'+q),dbRows('command_objectives?'+q),dbRows('command_projects?'+q),dbRows('command_business_units?'+q),dbRows('command_products?'+q),dbRows('command_distribution_channels?'+q),dbRows('command_resource_allocations?'+q),dbRows('command_outcomes?'+q),dbRows('command_executive_cycles?user_id=eq.'+encodeURIComponent(userId)+'&cycle_date=eq.'+dateKey()+'&select=*&limit=1')
  ]);
  return{decisions,objectives,projects,businesses,products,channels,allocations,outcomes,existing:cycles[0]||null};
}
Deno.serve(async(req:Request)=>{
  let stage='AUTH';
  if(req.method!=='GET'&&req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET, POST','Cache-Control':'no-store'}});
  if(!(await authorized(req)))return Response.json({ok:false,error:'unauthorized_private_runtime'},{status:401,headers:{'Cache-Control':'no-store'}});
  try{
    if(!SERVICE_ROLE)throw new Error('service_role_unavailable');
    stage='SOURCE_AND_OWNER_LOAD';
    const [sourceResults,owners]=await Promise.all([
      Promise.all(SOURCES.map(x=>source(x[0] as string,x[1] as string,x[2] as string,x[3] as boolean))),
      dbRows('owner_users?active=eq.true&select=user_id')
    ]);
    if(!owners.length)throw new Error('no_active_owner');
    const results:any[]=[];
    for(const owner of owners){
      stage='OWNER_STATE_LOAD';
      const data=await loadOwner(owner.user_id);
      stage='CYCLE_BUILD';
      const cycle=buildCycle(owner.user_id,data,sourceResults,data.existing);
      if(cycle.changed){stage='CYCLE_PERSIST';const row={...cycle};delete row.changed;await upsert('command_executive_cycles','user_id,cycle_date',row)}
      stage='INTERVENTION_SYNC';
      const intervention_sync=await syncInterventionInbox(owner.user_id,cycle);
      results.push({user_id:owner.user_id,cycle_date:cycle.cycle_date,changed:cycle.changed,generation_count:cycle.generation_count,state_fingerprint:cycle.state_fingerprint,summary:cycle.summary,anomaly_count:cycle.anomalies.length,human_decision_count:cycle.human_decisions.length,machine_health_pct:cycle.machine_health_pct,sovereign_action:cycle.sovereign_action,capital_permission:cycle.capital_permission,intervention_sync});
    }
    return Response.json({ok:true,version:'v174-executive-workflow-runtime-v1',generated_at:new Date().toISOString(),owners_processed:results.length,results,governance:{planning_only:true,action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}},{headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V174'}});
  }catch(error){
    console.error('V174_EXECUTIVE_WORKFLOW_ERROR',stage,String(error).slice(0,300));
    return Response.json({ok:false,version:'v174-executive-workflow-runtime-v1',state:'FAIL_CLOSED',error:'executive_cycle_runtime_unavailable',stage,detail:String(error).slice(0,180),governance:{action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false}},{status:503,headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V174'}});
  }
});
