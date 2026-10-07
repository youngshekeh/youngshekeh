
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
  if(!r.ok)throw new Error(`upsert_${table}_${r.status}`);
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
async function insertOnce(table:string,conflict:string,row:any){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',
    headers:{...headers(),Prefer:'resolution=ignore-duplicates,return=representation'},
    body:JSON.stringify(row),
    signal:AbortSignal.timeout(12000)
  });
  const body=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(`insert_once_${table}_${r.status}`);
  return Array.isArray(body)&&body.length>0;
}
async function bulkUpsert(table:string,conflict:string,rows:any[]){
  if(!rows.length)return;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',
    headers:{...headers(),Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(rows),
    signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw new Error(`bulk_upsert_${table}_${r.status}`);
}
async function bulkInsertIgnore(table:string,conflict:string,rows:any[]){
  if(!rows.length)return;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`,{
    method:'POST',
    headers:{...headers(),Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify(rows),
    signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw new Error(`bulk_insert_ignore_${table}_${r.status}`);
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
        id,user_id:userId,intervention_key:s.intervention_key,source:'EXECUTIVE_CYCLE',
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


function runbookPolicy(intervention:any){
  const category=String(intervention.category||'OPERATING').toUpperCase();
  const approvalRequired=intervention.approval_required===true||category==='GOVERNANCE'||category==='HUMAN'||n(intervention.severity)>=95;
  return{
    approvalRequired,
    ceiling:approvalRequired?'HUMAN_APPROVAL_REQUIRED':'REVERSIBLE_EXECUTE',
    preconditions:[
      'Evidence snapshot must be captured from the current governed intervention.',
      'Sovereign permission remains authoritative and cannot be promoted by this runbook.',
      'No external irreversible action is permitted by V175.'
    ],
    rollback:[
      'Internal work-package records may be superseded by the next runbook version.',
      'No external state is changed by V175 safe execution.'
    ],
    evidence:[
      'Source fingerprint',
      'Intervention status and signal state',
      'Action-run receipt with governance flags'
    ]
  };
}
function runbookStepSpecs(runbookId:string,userId:string,approvalRequired:boolean){
  const out:any[]=[
    {step_key:'OBSERVE',position:1,title:'Capture governed evidence',description:'Freeze the current intervention evidence and decision context.',capability_class:'OBSERVE',action_kind:'SNAPSHOT_EVIDENCE',auto_executable:true,requires_owner_approval:false},
    {step_key:'PROPOSE',position:2,title:'Generate intervention proposal',description:'Turn the recommended action into a bounded proposal without performing the underlying action.',capability_class:'PROPOSE',action_kind:'GENERATE_PROPOSAL',auto_executable:true,requires_owner_approval:false}
  ];
  let pos=3;
  if(approvalRequired){
    out.push({step_key:'OWNER_APPROVAL',position:pos++,title:'Owner approval gate',description:'Owner approval is required before the internal reversible work package can be prepared.',capability_class:'HUMAN_APPROVAL_REQUIRED',action_kind:'OWNER_APPROVAL',auto_executable:false,requires_owner_approval:true});
  }
  out.push({step_key:'WORK_PACKAGE',position:pos++,title:'Prepare reversible internal work package',description:'Prepare internal execution instructions and rollback notes. This changes no external system.',capability_class:'REVERSIBLE_EXECUTE',action_kind:'PREPARE_INTERNAL_WORK_PACKAGE',auto_executable:true,requires_owner_approval:approvalRequired});
  out.push({step_key:'AUTHORITY_BOUNDARY',position:pos,title:'External authority boundary',description:'Trading, payments, fund transfers, credential changes, secret access and irreversible external changes are outside V175 authority.',capability_class:'FORBIDDEN',action_kind:'EXTERNAL_IRREVERSIBLE',auto_executable:false,requires_owner_approval:false});
  return out.map(x=>({...x,user_id:userId,runbook_id:runbookId}));
}
async function recordActionRun(userId:string,runbook:any,step:any,cycle:any,intervention:any,mode:string,output:any,status='SUCCEEDED'){
  const runKey='RUN:'+runbook.runbook_key+':'+step.step_key+':'+String(runbook.source_fingerprint||cycle.state_fingerprint);
  const existing=await dbRows('command_action_runs?user_id=eq.'+encodeURIComponent(userId)+'&run_key=eq.'+encodeURIComponent(runKey)+'&select=id,status&limit=1');
  if(existing.length)return{executed:false,status:existing[0].status,run_key:runKey};
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const governance={
    planning_only:true,
    sovereign_action:cycle.sovereign_action,
    capital_permission:cycle.capital_permission,
    funds_moved:false,
    trades_sent:false,
    credentials_changed:false,
    external_irreversible_action:false,
    external_effects:false
  };
  const inserted=await insertOnce('command_action_runs','user_id,run_key',{
    id,user_id:userId,runbook_id:runbook.id,step_id:step.id,run_key:runKey,mode,
    capability_class:step.capability_class,action_kind:step.action_kind,status,
    input:{intervention_id:intervention.id,source_code:intervention.source_code,source_fingerprint:runbook.source_fingerprint},
    output,evidence:{intervention_status:intervention.status,signal_active:intervention.signal_active,source_fingerprint:runbook.source_fingerprint},
    governance,error:'',started_at:now,completed_at:now,created_at:now
  });
  if(!inserted)return{executed:false,status,run_key:runKey};
  await insertRows('command_action_events',[{
    user_id:userId,runbook_id:runbook.id,step_id:step.id,action_run_id:id,
    event_type:status==='BLOCKED'?'ACTION_BLOCKED':'ACTION_SUCCEEDED',actor:'SYSTEM',
    note:status==='BLOCKED'?'V175 recorded a hard authority boundary.':'V175 completed an internal safe action with zero external side effects.',
    evidence:{run_key:runKey,capability_class:step.capability_class,action_kind:step.action_kind,governance},
    created_at:now
  }]);
  return{executed:true,status,run_key:runKey};
}
async function executeRunbookStep(userId:string,runbook:any,step:any,cycle:any,intervention:any){
  const now=new Date().toISOString();
  if(step.capability_class==='FORBIDDEN'){
    const receipt=await recordActionRun(userId,runbook,step,cycle,intervention,'DRY_RUN',{
      blocked:true,
      reason:'V175 does not possess authority for external irreversible actions.',
      prohibited:['TRADE_ORDER','PAYMENT','FUND_TRANSFER','CREDENTIAL_CHANGE','SECRET_ACCESS','EXTERNAL_IRREVERSIBLE']
    },'BLOCKED');
    return{...receipt,step};
  }
  if(step.capability_class==='HUMAN_APPROVAL_REQUIRED')return{executed:false,status:'PENDING',step};
  if(step.requires_owner_approval&&runbook.status!=='APPROVED')return{executed:false,status:'AWAITING_APPROVAL',step};

  let output:any={};
  if(step.capability_class==='OBSERVE'){
    output={
      captured:true,
      source_code:intervention.source_code,
      title:intervention.title,
      signal_active:intervention.signal_active,
      workflow_status:intervention.status,
      severity:intervention.severity,
      priority:intervention.priority,
      recommended_action:intervention.recommended_action,
      source_fingerprint:runbook.source_fingerprint
    };
  }else if(step.capability_class==='PROPOSE'){
    output={
      proposal:intervention.recommended_action||'Review intervention and choose the least irreversible next action.',
      constraints:[
        'Preserve sovereign permission.',
        'Do not move funds or place trades.',
        'Do not change credentials or access secrets.',
        'Require explicit owner judgment where the runbook says approval is required.'
      ],
      rollback_plan:runbook.rollback_plan
    };
  }else{
    output={
      work_package:{
        objective:runbook.objective,
        next_action:intervention.recommended_action||'Review and prepare bounded internal work.',
        preconditions:runbook.preconditions,
        rollback_plan:runbook.rollback_plan,
        evidence_requirements:runbook.evidence_requirements
      },
      external_effects:false
    };
  }
  const mode=step.requires_owner_approval?'OWNER_APPROVED':'AUTO';
  const receipt=await recordActionRun(userId,runbook,step,cycle,intervention,mode,output,'SUCCEEDED');
  if(receipt.executed||step.status!=='SUCCEEDED'){
    await patchRow('command_runbook_steps',step.id,{
      status:'SUCCEEDED',evidence:output,last_source_fingerprint:runbook.source_fingerprint,
      attempt_count:n(step.attempt_count)+1,started_at:step.started_at||now,completed_at:now
    });
    step.status='SUCCEEDED';step.evidence=output;step.completed_at=now;
  }
  return{...receipt,step};
}
async function syncRunbooks(userId:string,cycle:any){
  const [interventions,runbooks,steps]=await Promise.all([
    dbRows('command_interventions?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_runbooks?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_runbook_steps?user_id=eq.'+encodeURIComponent(userId)+'&select=*')
  ]);
  const open=interventions.filter((x:any)=>!['RESOLVED','LEARNED'].includes(x.status));
  const byKey=new Map(runbooks.map((x:any)=>[x.runbook_key,x]));
  const stepMap=new Map<string,any[]>();
  for(const s of steps){const a=stepMap.get(s.runbook_id)||[];a.push(s);stepMap.set(s.runbook_id,a)}
  let compiled=0,versioned=0,autoExecuted=0,awaitingApproval=0,completed=0,blockedBoundaries=0;

  for(const intervention of open){
    const key='RUNBOOK:'+intervention.intervention_key,prior:any=byKey.get(key),policy=runbookPolicy(intervention);
    const fingerprint=String(intervention.source_fingerprint||cycle.state_fingerprint);
    const changed=!prior||String(prior.source_fingerprint||'')!==fingerprint;
    const id=prior?.id||crypto.randomUUID();
    let status=prior?.status||(policy.approvalRequired?'READY':'RUNNING');
    let version=prior?Math.max(1,n(prior.version))+(changed?1:0):1;
    if(prior&&changed)status=policy.approvalRequired?'READY':'RUNNING';
    const runbook:any={
      id,user_id:userId,intervention_id:intervention.id,runbook_key:key,
      title:'Runbook · '+intervention.title,
      objective:intervention.recommended_action||'Resolve the governed intervention with evidence.',
      status,capability_ceiling:policy.ceiling,approval_required:policy.approvalRequired,
      approved_at:changed?null:(prior?.approved_at||null),approval_note:changed?'':(prior?.approval_note||''),
      source_fingerprint:fingerprint,version,
      preconditions:policy.preconditions,rollback_plan:policy.rollback,evidence_requirements:policy.evidence,
      generated_by:'SYSTEM',created_at:prior?.created_at||new Date().toISOString(),updated_at:new Date().toISOString()
    };
    if(!prior){
      await upsert('command_runbooks','user_id,runbook_key',runbook);
      compiled++;
    }else if(changed){
      await patchRow('command_runbooks',id,{
        intervention_id:intervention.id,title:runbook.title,objective:runbook.objective,status,
        capability_ceiling:runbook.capability_ceiling,approval_required:runbook.approval_required,
        approved_at:null,approval_note:'',source_fingerprint:fingerprint,version,
        preconditions:runbook.preconditions,rollback_plan:runbook.rollback_plan,evidence_requirements:runbook.evidence_requirements
      });
      versioned++;
    }else{
      Object.assign(runbook,prior);
    }

    const existingSteps=stepMap.get(id)||[],existingByKey=new Map(existingSteps.map((x:any)=>[x.step_key,x]));
    const specs=runbookStepSpecs(id,userId,policy.approvalRequired);
    const liveSteps:any[]=[];
    for(const spec of specs){
      const old:any=existingByKey.get(spec.step_key);
      if(!old){
        const step={id:crypto.randomUUID(),...spec,status:spec.capability_class==='FORBIDDEN'?'BLOCKED':'PENDING',params:{},preconditions:policy.preconditions,rollback_plan:policy.rollback,evidence:{},last_source_fingerprint:null,attempt_count:0,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};
        await upsert('command_runbook_steps','runbook_id,step_key',step);
        liveSteps.push(step);
      }else if(changed){
        const nextStatus=spec.capability_class==='FORBIDDEN'?'BLOCKED':'PENDING';
        await patchRow('command_runbook_steps',old.id,{...spec,status:nextStatus,params:{},preconditions:policy.preconditions,rollback_plan:policy.rollback,evidence:{},last_source_fingerprint:null,started_at:null,completed_at:null});
        liveSteps.push({...old,...spec,status:nextStatus,evidence:{},last_source_fingerprint:null,started_at:null,completed_at:null});
      }else liveSteps.push(old);
    }

    const observe=liveSteps.find(x=>x.step_key==='OBSERVE');
    const propose=liveSteps.find(x=>x.step_key==='PROPOSE');
    const approval=liveSteps.find(x=>x.step_key==='OWNER_APPROVAL');
    const work=liveSteps.find(x=>x.step_key==='WORK_PACKAGE');
    const boundary=liveSteps.find(x=>x.step_key==='AUTHORITY_BOUNDARY');

    for(const step of [observe,propose].filter(Boolean)){
      const r=await executeRunbookStep(userId,runbook,step,cycle,intervention);
      if(r.executed)autoExecuted++;
    }
    if(boundary){
      const r=await executeRunbookStep(userId,runbook,boundary,cycle,intervention);
      if(r.executed)blockedBoundaries++;
    }

    if(policy.approvalRequired){
      if(runbook.status==='APPROVED'){
        if(approval&&approval.status!=='SUCCEEDED'){
          const now=new Date().toISOString();
          await patchRow('command_runbook_steps',approval.id,{status:'SUCCEEDED',evidence:{approved_at:runbook.approved_at,approval_note:runbook.approval_note},last_source_fingerprint:fingerprint,attempt_count:n(approval.attempt_count)+1,started_at:now,completed_at:now});
          await insertRows('command_action_events',[{user_id:userId,runbook_id:id,step_id:approval.id,action_run_id:null,event_type:'OWNER_APPROVAL_OBSERVED',actor:'SYSTEM',note:'V175 observed the owner approval and unlocked only the reversible internal work-package step.',evidence:{approved_at:runbook.approved_at,version:runbook.version},created_at:now}]);
          approval.status='SUCCEEDED';
        }
        const r=work?await executeRunbookStep(userId,runbook,work,cycle,intervention):null;
        if(r?.executed)autoExecuted++;
        await patchRow('command_runbooks',id,{status:'COMPLETE'});
        runbook.status='COMPLETE';completed++;
      }else{
        if(runbook.status!=='READY'){await patchRow('command_runbooks',id,{status:'READY'});runbook.status='READY'}
        awaitingApproval++;
      }
    }else{
      const r=work?await executeRunbookStep(userId,runbook,work,cycle,intervention):null;
      if(r?.executed)autoExecuted++;
      if(runbook.status!=='COMPLETE'){await patchRow('command_runbooks',id,{status:'COMPLETE'});runbook.status='COMPLETE'}
      completed++;
    }
  }

  return{open_interventions:open.length,compiled,versioned,auto_executed:autoExecuted,awaiting_approval:awaitingApproval,completed,blocked_boundaries:blockedBoundaries};
}


const AGENT_SPECS=[
  {agent_key:'RESEARCH_AGENT',name:'Research Agent',domain:'RESEARCH',capability_ceiling:'PROPOSE',allowed_action_kinds:['GENERATE_PROPOSAL','PLANNER_SYNTHESIS'],max_open_assignments:8,description:'Synthesizes bounded proposals and research briefs from governed evidence.'},
  {agent_key:'QA_AGENT',name:'QA Agent',domain:'QUALITY',capability_ceiling:'PROPOSE',allowed_action_kinds:['SNAPSHOT_EVIDENCE','CHECK_PRECONDITIONS','GENERATE_PROPOSAL','PLANNER_QA'],max_open_assignments:8,description:'Checks evidence quality, governance assumptions and bounded proposals.'},
  {agent_key:'DATA_AGENT',name:'Data Agent',domain:'DATA',capability_ceiling:'OBSERVE',allowed_action_kinds:['SNAPSHOT_EVIDENCE','CHECK_PRECONDITIONS','PLANNER_EVIDENCE'],max_open_assignments:12,description:'Captures and structures governed evidence without changing external state.'},
  {agent_key:'ENGINEERING_AGENT',name:'Engineering Agent',domain:'ENGINEERING',capability_ceiling:'REVERSIBLE_EXECUTE',allowed_action_kinds:['GENERATE_PROPOSAL','PREPARE_INTERNAL_WORK_PACKAGE','INTERNAL_RECORD_UPDATE','PLANNER_SYNTHESIS','PLANNER_WORK_PACKAGE'],max_open_assignments:6,description:'Prepares bounded technical remediation work packages and internal reversible changes.'},
  {agent_key:'PRODUCT_AGENT',name:'Product Agent',domain:'PRODUCT',capability_ceiling:'REVERSIBLE_EXECUTE',allowed_action_kinds:['GENERATE_PROPOSAL','PREPARE_INTERNAL_WORK_PACKAGE','INTERNAL_RECORD_UPDATE','PLANNER_SYNTHESIS','PLANNER_WORK_PACKAGE'],max_open_assignments:6,description:'Turns product evidence into bounded proposals and internal work packages.'},
  {agent_key:'SEO_AGENT',name:'SEO & Distribution Agent',domain:'DISTRIBUTION',capability_ceiling:'REVERSIBLE_EXECUTE',allowed_action_kinds:['GENERATE_PROPOSAL','PREPARE_INTERNAL_WORK_PACKAGE','INTERNAL_RECORD_UPDATE','PLANNER_SYNTHESIS','PLANNER_WORK_PACKAGE'],max_open_assignments:6,description:'Prepares SEO, audience and distribution work products without publishing externally.'},
  {agent_key:'OPERATIONS_AGENT',name:'Operations Agent',domain:'OPERATIONS',capability_ceiling:'REVERSIBLE_EXECUTE',allowed_action_kinds:['GENERATE_PROPOSAL','PREPARE_INTERNAL_WORK_PACKAGE','INTERNAL_RECORD_UPDATE','PLANNER_SYNTHESIS','PLANNER_WORK_PACKAGE'],max_open_assignments:10,description:'Packages approved bounded work into reversible internal operating instructions.'}
];
async function ensureAgents(userId:string){
  const now=new Date().toISOString();
  await bulkUpsert('command_agents','user_id,agent_key',AGENT_SPECS.map((x:any)=>({
    user_id:userId,...x,status:'ACTIVE',created_at:now,updated_at:now
  })));
  return dbRows('command_agents?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
}
function routeAgent(step:any,runbook:any){
  const kind=String(step.action_kind||''),ctx=(String(runbook.title||'')+' '+String(runbook.objective||'')+' '+String(step.title||'')+' '+String(step.description||'')).toUpperCase();
  if(kind==='SNAPSHOT_EVIDENCE'||kind==='CHECK_PRECONDITIONS')return'DATA_AGENT';
  if(/SEO|SEARCH|PLAYLIST|AUDIENCE|DISTRIBUTION|CONTENT|SOCIAL/.test(ctx))return kind==='GENERATE_PROPOSAL'?'SEO_AGENT':'SEO_AGENT';
  if(/\bPRODUCT\b|\bUSERS?\b|CONVERSION|MRR|CHURN|ONBOARD|MEMBER/.test(ctx))return'PRODUCT_AGENT';
  if(/QUALITY|QA|GOVERNANCE|GATE|PERMISSION|AUDIT/.test(ctx)&&kind==='GENERATE_PROPOSAL')return'QA_AGENT';
  if(/SYSTEM|ENGINEER|TECH|HEALTH|FEED|SOURCE|RUNTIME|API|DEPLOY|DATABASE|CLOSURE/.test(ctx))return'ENGINEERING_AGENT';
  if(kind==='PREPARE_INTERNAL_WORK_PACKAGE'||kind==='INTERNAL_RECORD_UPDATE')return'OPERATIONS_AGENT';
  return'RESEARCH_AGENT';
}
function agentWorkProduct(agent:any,step:any,runbook:any,actionRun:any){
  const base={
    agent_key:agent.agent_key,
    agent_name:agent.name,
    domain:agent.domain,
    objective:runbook.objective,
    capability_class:step.capability_class,
    action_kind:step.action_kind,
    source_fingerprint:runbook.source_fingerprint,
    external_effects:false
  };
  if(agent.agent_key==='DATA_AGENT')return{...base,evidence_packet:step.evidence||actionRun?.evidence||{},verdict:'Evidence captured for downstream governed work.'};
  if(agent.agent_key==='QA_AGENT')return{...base,qa_packet:{evidence:step.evidence||{},checks:['authority boundary preserved','source fingerprint attached','no external effect requested']},verdict:'Bounded proposal may proceed only within existing permissions.'};
  if(agent.agent_key==='ENGINEERING_AGENT')return{...base,engineering_packet:{recommended_internal_work:runbook.objective,rollback:runbook.rollback_plan,preconditions:runbook.preconditions},verdict:'Prepared technical work only. No external deployment or credential action performed.'};
  if(agent.agent_key==='PRODUCT_AGENT')return{...base,product_packet:{hypothesis:runbook.objective,work_product:step.evidence||actionRun?.output||{},next_validation:'Measure outcome before expanding scope.'}};
  if(agent.agent_key==='SEO_AGENT')return{...base,distribution_packet:{brief:runbook.objective,work_product:step.evidence||actionRun?.output||{},publishing_authority:false}};
  if(agent.agent_key==='OPERATIONS_AGENT')return{...base,operations_packet:{work_package:step.evidence?.work_package||actionRun?.output?.work_package||{},rollback:runbook.rollback_plan},verdict:'Internal operating package prepared. External execution authority not granted.'};
  return{...base,research_packet:{proposal:step.evidence?.proposal||actionRun?.output?.proposal||runbook.objective,constraints:actionRun?.output?.constraints||[]},verdict:'Proposal generated for governed review.'};
}
async function syncAgentWorkforce(userId:string,cycle:any){
  const agents=await ensureAgents(userId);
  const [runbooks,steps,runs,existing]=await Promise.all([
    dbRows('command_runbooks?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_runbook_steps?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_action_runs?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_agent_assignments?user_id=eq.'+encodeURIComponent(userId)+'&select=*')
  ]);
  const agentByKey=new Map(agents.map((x:any)=>[x.agent_key,x]));
  const runbookById=new Map(runbooks.map((x:any)=>[x.id,x]));
  const runByStep=new Map<string,any>();
  for(const r of runs.sort((a:any,b:any)=>String(b.created_at).localeCompare(String(a.created_at)))){
    if(!runByStep.has(r.step_id))runByStep.set(r.step_id,r);
  }
  const existingKeys=new Set(existing.map((x:any)=>x.assignment_key));
  const assignments:any[]=[],events:any[]=[];
  let routed=0,completed=0,queued=0,blocked=0;

  for(const step of steps){
    if(!['OBSERVE','PROPOSE','REVERSIBLE_EXECUTE'].includes(step.capability_class))continue;
    if(['OWNER_APPROVAL','TRADE_ORDER','PAYMENT','FUND_TRANSFER','CREDENTIAL_CHANGE','SECRET_ACCESS','EXTERNAL_IRREVERSIBLE'].includes(step.action_kind))continue;
    const runbook:any=runbookById.get(step.runbook_id);if(!runbook)continue;
    const agentKey=routeAgent(step,runbook),agent:any=agentByKey.get(agentKey);if(!agent||agent.status!=='ACTIVE')continue;
    if(!Array.isArray(agent.allowed_action_kinds)||!agent.allowed_action_kinds.includes(step.action_kind))continue;
    const fingerprint=String(runbook.source_fingerprint||cycle.state_fingerprint);
    const key='ASSIGN:'+runbook.runbook_key+':'+step.step_key+':'+fingerprint;
    const actionRun:any=runByStep.get(step.id)||null;
    const isDone=step.status==='SUCCEEDED'&&actionRun?.status==='SUCCEEDED';
    const status=isDone?'COMPLETE':step.status==='BLOCKED'?'BLOCKED':'QUEUED';
    const now=new Date().toISOString();
    const row={
      user_id:userId,agent_id:agent.id,runbook_id:runbook.id,step_id:step.id,
      action_run_id:actionRun?.id||null,assignment_key:key,capability_class:step.capability_class,
      action_kind:step.action_kind,status,
      work_order:{title:step.title,description:step.description,objective:runbook.objective,runbook_version:runbook.version},
      output:isDone?agentWorkProduct(agent,step,runbook,actionRun):{},
      evidence:{source_fingerprint:fingerprint,step_status:step.status,action_run_status:actionRun?.status||null},
      governance:{planning_only:true,funds_moved:false,trades_sent:false,credentials_changed:false,secret_accessed:false,external_irreversible_action:false,external_effects:false,sovereign_action:cycle.sovereign_action,capital_permission:cycle.capital_permission},
      source_fingerprint:fingerprint,attempt_count:isDone?1:0,queued_at:now,
      started_at:isDone?now:null,completed_at:isDone?now:null,created_at:now,updated_at:now
    };
    assignments.push(row);
    if(!existingKeys.has(key)){
      routed++;
      events.push({user_id:userId,agent_id:agent.id,assignment_id:null,event_key:key+':ROUTED',event_type:'ASSIGNMENT_ROUTED',note:'V176 routed a governed runbook step within the agent capability budget.',evidence:{assignment_key:key,capability_class:step.capability_class,action_kind:step.action_kind,source_fingerprint:fingerprint},created_at:now});
      if(isDone)events.push({user_id:userId,agent_id:agent.id,assignment_id:null,event_key:key+':COMPLETE',event_type:'ASSIGNMENT_COMPLETE',note:'Agent produced an internal governed work product with zero external side effects.',evidence:{assignment_key:key,external_effects:false},created_at:now});
    }
    if(status==='COMPLETE')completed++;else if(status==='BLOCKED')blocked++;else queued++;
  }

  await bulkUpsert('command_agent_assignments','user_id,assignment_key',assignments);
  if(events.length){
    const refreshed=await dbRows('command_agent_assignments?user_id=eq.'+encodeURIComponent(userId)+'&select=id,assignment_key');
    const idByKey=new Map(refreshed.map((x:any)=>[x.assignment_key,x.id]));
    await bulkInsertIgnore('command_agent_events','user_id,event_key',events.map((e:any)=>({...e,assignment_id:idByKey.get(e.evidence.assignment_key)||null})));
  }
  return{agents:agents.length,routed,completed,queued,blocked,forbidden_routed:0,external_effects:0};
}


function plannerAgentKey(domain:any,title:any,objective:any){
  const ctx=(String(domain||'')+' '+String(title||'')+' '+String(objective||'')).toUpperCase();
  if(/SEO|SEARCH|PLAYLIST|AUDIENCE|DISTRIBUTION|CONTENT|SOCIAL|MARKETING/.test(ctx))return'SEO_AGENT';
  if(/\bPRODUCT\b|\bUSERS?\b|CONVERSION|MRR|CHURN|ONBOARD|MEMBER/.test(ctx))return'PRODUCT_AGENT';
  if(/SYSTEM|ENGINEER|TECH|HEALTH|FEED|SOURCE|RUNTIME|API|DEPLOY|DATABASE|CLOSURE|INFRA/.test(ctx))return'ENGINEERING_AGENT';
  if(/RESEARCH|ANALYSIS|THESIS|FORECAST|MARKET/.test(ctx))return'RESEARCH_AGENT';
  return'OPERATIONS_AGENT';
}
function plannerSourceRows(data:any,interventions:any[]){
  const rows:any[]=[];
  for(const p of data.projects.filter((x:any)=>['ACTIVE','PLANNED','BLOCKED'].includes(x.status))){
    const o=data.objectives.find((x:any)=>x.client_objective_id===p.objective_client_id);
    const blocker=String(p.blocker||'').trim(),confidence=clamp(n(p.confidence),0,100);
    const gateReason=blocker?'Project blocker: '+blocker:(confidence<50?'Project confidence is '+confidence+'%, below the 50% planner threshold.':'');
    rows.push({
      source_type:'PROJECT',
      source_client_id:p.client_project_id,
      objective_client_id:p.objective_client_id||null,
      title:p.title,
      objective:String(p.next_action||o?.title||p.title),
      domain:p.domain||'OPERATIONS',
      priority:projectScore(p,data.objectives,data.outcomes),
      source_state:p.status,
      gate_reason:gateReason,
      gate_question:gateReason?(blocker?'What decision or condition clears this project blocker: '+blocker+'?':'Proceed with bounded internal planning, revise the project scope, or defer it?'):'',
      snapshot:{project:p,objective:o||null}
    });
  }
  for(const i of interventions.filter((x:any)=>!['RESOLVED','LEARNED'].includes(x.status)&&x.signal_active!==false)){
    const gate=i.approval_required===true||String(i.category||'').toUpperCase()==='GOVERNANCE'||n(i.severity)>=95;
    const reason=gate?('Executive intervention requires owner judgment before the reversible work-package handoff. Severity '+n(i.severity)+' / 100.'):'';
    rows.push({
      source_type:'INTERVENTION',
      source_client_id:i.intervention_key,
      objective_client_id:null,
      title:i.title,
      objective:i.recommended_action||i.summary||i.title,
      domain:i.category||'OPERATIONS',
      priority:clamp(n(i.priority)||n(i.severity)||50,0,100),
      source_state:i.status,
      gate_reason:reason,
      gate_question:gate?'Approve the bounded internal planning path, revise it, or keep this intervention waiting?':'',
      snapshot:{intervention:i}
    });
  }
  return rows;
}
function plannerFingerprint(x:any){
  return'PLN-'+hash(JSON.stringify([
    x.source_type,x.source_client_id,x.objective_client_id,x.title,x.objective,x.domain,
    x.priority,x.source_state,x.gate_reason,x.snapshot?.project?.confidence,
    x.snapshot?.project?.blocker,x.snapshot?.intervention?.source_fingerprint,
    x.snapshot?.intervention?.signal_active
  ]));
}
function plannerTaskOutput(taskKey:string,src:any,gateResolved:boolean,ownerResponse:string){
  const base={source_type:src.source_type,source_client_id:src.source_client_id,external_effects:false};
  if(taskKey==='EVIDENCE')return{...base,evidence_packet:src.snapshot,verdict:'Current governed source state captured for planning.'};
  if(taskKey==='SYNTHESIS')return{...base,plan_brief:{objective:src.objective,priority:src.priority,domain:src.domain,current_state:src.source_state,gate_reason:src.gate_reason||null},verdict:'Bounded plan synthesized from available evidence.'};
  if(taskKey==='HUMAN_GATE')return{...base,required:!!src.gate_reason,resolved:gateResolved,owner_response:ownerResponse||'',verdict:src.gate_reason?(gateResolved?'Owner decision is available to the planner.':'Planner is waiting for owner judgment.'):'No owner gate required by current evidence.'};
  if(taskKey==='WORK_PACKAGE')return{...base,work_package:{objective:src.objective,steps:['Preserve the evidence packet.','Prepare only reversible internal work.','Return proof to QA before any scope expansion.'],authority_boundary:'No trading, payments, fund movement, credentials, secrets, publishing, deployment, or irreversible external action.'},verdict:gateResolved?'Reversible internal work package prepared.':'Blocked pending owner decision.'};
  return{...base,qa:{checks:['dependency chain satisfied','source fingerprint attached','zero external effects','authority boundary preserved'],ready:gateResolved},verdict:gateResolved?'PLAN_READY':'BLOCKED_BY_HUMAN_GATE'};
}
async function syncMultiAgentPlanner(userId:string,cycle:any,data:any){
  const [agents,interventions,existingPlans,existingEscalations]=await Promise.all([
    ensureAgents(userId),
    dbRows('command_interventions?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_plans?user_id=eq.'+encodeURIComponent(userId)+'&select=*'),
    dbRows('command_planner_escalations?user_id=eq.'+encodeURIComponent(userId)+'&select=*')
  ]);
  const sources=plannerSourceRows(data,interventions);
  const agentByKey=new Map(agents.map((x:any)=>[x.agent_key,x]));
  const priorPlanByKey=new Map(existingPlans.map((x:any)=>[x.plan_key,x]));
  const now=new Date().toISOString(),planRows:any[]=[],sourceByPlanKey=new Map<string,any>(),events:any[]=[];
  let compiled=0,versioned=0,staled=0;

  for(const s of sources){
    const planKey='PLAN:'+s.source_type+':'+s.source_client_id,fp=plannerFingerprint(s),prior:any=priorPlanByKey.get(planKey);
    const changed=!prior||String(prior.source_fingerprint||'')!==fp;
    const version=prior?Math.max(1,n(prior.version))+(changed?1:0):1;
    planRows.push({
      user_id:userId,plan_key:planKey,source_type:s.source_type,source_client_id:s.source_client_id,
      objective_client_id:s.objective_client_id,title:s.title,objective:s.objective,domain:s.domain,
      status:'ACTIVE',priority:s.priority,version,source_fingerprint:fp,
      summary:'Planner chain compiled from governed '+s.source_type.toLowerCase()+' evidence.',
      bottleneck:'',evidence:{source_state:s.source_state,cycle_fingerprint:cycle.state_fingerprint},
      updated_at:now
    });
    sourceByPlanKey.set(planKey,{...s,plan_key:planKey,fingerprint:fp,version,changed});
    if(!prior){compiled++;events.push({plan_key:planKey,event_key:'PLANNER:'+planKey+':V'+version+':COMPILED',event_type:'PLAN_COMPILED',note:'V177 compiled a new dependency graph from governed source evidence.',evidence:{source_fingerprint:fp,version}})}
    else if(changed){versioned++;events.push({plan_key:planKey,event_key:'PLANNER:'+planKey+':V'+version+':VERSIONED',event_type:'PLAN_VERSIONED',note:'V177 refreshed the dependency graph because decision-relevant source evidence changed.',evidence:{source_fingerprint:fp,version}})}
  }

  await bulkUpsert('command_plans','user_id,plan_key',planRows);
  const plans=await dbRows('command_plans?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
  const planByKey=new Map(plans.map((x:any)=>[x.plan_key,x]));
  const activeKeys=new Set(sources.map((s:any)=>'PLAN:'+s.source_type+':'+s.source_client_id));
  for(const p of plans){
    if(!activeKeys.has(p.plan_key)&&p.status!=='STALE'&&p.status!=='ARCHIVED'){
      await patchRow('command_plans',p.id,{status:'STALE',bottleneck:'Source is no longer active.',updated_at:now});
      staled++;
    }
  }

  const existingTasks=await dbRows('command_plan_tasks?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
  const oldTaskByKey=new Map(existingTasks.map((x:any)=>[x.plan_id+':'+x.task_key,x]));
  const escByKey=new Map(existingEscalations.map((x:any)=>[x.escalation_key,x]));
  const taskRows:any[]=[],escalationRows:any[]=[],currentEscKeys=new Set<string>();
  const planState=new Map<string,{status:string,bottleneck:string,gateResolved:boolean}>();

  for(const [planKey,s] of sourceByPlanKey.entries()){
    const plan:any=planByKey.get(planKey);if(!plan)continue;
    const specialistKey=plannerAgentKey(s.domain,s.title,s.objective),specialist:any=agentByKey.get(specialistKey)||agentByKey.get('OPERATIONS_AGENT');
    const workAgent:any=specialist?.capability_ceiling==='REVERSIBLE_EXECUTE'?specialist:agentByKey.get('OPERATIONS_AGENT');
    const dataAgent:any=agentByKey.get('DATA_AGENT'),qaAgent:any=agentByKey.get('QA_AGENT');
    if(!dataAgent||!specialist||!workAgent||!qaAgent)throw new Error('planner_agent_roster_incomplete');

    const escKey=s.gate_reason?'ESC:'+planKey+':'+hash(s.gate_reason):'',priorEsc:any=s.gate_reason?escByKey.get(escKey):null;
    const gateResolved=!s.gate_reason||(priorEsc?.status==='RESOLVED'&&priorEsc?.signal_active!==false);
    const ownerResponse=priorEsc?.owner_response||'';
    if(s.gate_reason){
      currentEscKeys.add(escKey);
      escalationRows.push({
        user_id:userId,plan_id:plan.id,task_id:oldTaskByKey.get(plan.id+':HUMAN_GATE')?.id||null,
        escalation_key:escKey,reason:s.gate_reason,question:s.gate_question,priority:Math.max(75,s.priority),
        status:priorEsc?.status||'OPEN',owner_response:ownerResponse, evidence:{plan_key:planKey,source_fingerprint:s.fingerprint},
        opened_at:priorEsc?.opened_at||now,acknowledged_at:priorEsc?.acknowledged_at||null,
        resolved_at:priorEsc?.resolved_at||null,signal_active:true,cleared_at:null,updated_at:now
      });
    }
    planState.set(plan.id,{status:gateResolved?'READY':'WAITING_HUMAN',bottleneck:gateResolved?'':s.gate_reason,gateResolved});

    const taskSpecs=[
      {key:'EVIDENCE',position:1,title:'Capture source evidence',domain:'DATA',capability:'OBSERVE',kind:'PLANNER_EVIDENCE',agent:dataAgent,status:'COMPLETE'},
      {key:'SYNTHESIS',position:2,title:'Specialist synthesis',domain:specialist.domain,capability:'PROPOSE',kind:'PLANNER_SYNTHESIS',agent:specialist,status:'COMPLETE'},
      {key:'HUMAN_GATE',position:3,title:'Architect decision gate',domain:'GOVERNANCE',capability:'HUMAN_DECISION',kind:'HUMAN_DECISION',agent:null,status:gateResolved?'COMPLETE':'ESCALATED'},
      {key:'WORK_PACKAGE',position:4,title:'Prepare reversible work package',domain:workAgent.domain,capability:'REVERSIBLE_EXECUTE',kind:'PLANNER_WORK_PACKAGE',agent:workAgent,status:gateResolved?'COMPLETE':'BLOCKED'},
      {key:'QA',position:5,title:'Verify dependency chain',domain:'QUALITY',capability:'PROPOSE',kind:'PLANNER_QA',agent:qaAgent,status:gateResolved?'COMPLETE':'BLOCKED'}
    ];
    for(const t of taskSpecs){
      const old:any=oldTaskByKey.get(plan.id+':'+t.key),same=old&&old.source_fingerprint===s.fingerprint&&old.status===t.status;
      const output=plannerTaskOutput(t.key,s,gateResolved,ownerResponse);
      taskRows.push({
        user_id:userId,plan_id:plan.id,task_key:t.key,position:t.position,title:t.title,
        description:t.key==='HUMAN_GATE'?(s.gate_reason||'No owner decision required.'):'Internal planning task with zero external side effects.',
        domain:t.domain,capability_class:t.capability,action_kind:t.kind,assigned_agent_id:t.agent?.id||null,
        status:t.status,priority:s.priority,
        work_order:{objective:s.objective,source_type:s.source_type,source_client_id:s.source_client_id},
        output,evidence:{source_fingerprint:s.fingerprint,cycle_fingerprint:cycle.state_fingerprint,external_effects:false},
        source_fingerprint:s.fingerprint,
        started_at:same?old.started_at:now,
        completed_at:t.status==='COMPLETE'?(same?old.completed_at||now:now):null,
        updated_at:now
      });
    }
  }

  await bulkUpsert('command_plan_tasks','plan_id,task_key',taskRows);
  const tasks=await dbRows('command_plan_tasks?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
  const taskByKey=new Map(tasks.map((x:any)=>[x.plan_id+':'+x.task_key,x]));

  const fixedEscRows=escalationRows.map((e:any)=>({...e,task_id:taskByKey.get(e.plan_id+':HUMAN_GATE')?.id||e.task_id}));
  await bulkUpsert('command_planner_escalations','user_id,escalation_key',fixedEscRows);
  for(const e of existingEscalations){
    if(e.signal_active!==false&&!currentEscKeys.has(e.escalation_key)){
      await patchRow('command_planner_escalations',e.id,{signal_active:false,cleared_at:now,updated_at:now});
    }
  }

  const deps:any[]=[];
  for(const [planKey,s] of sourceByPlanKey.entries()){
    const plan:any=planByKey.get(planKey);if(!plan)continue;
    const evidence:any=taskByKey.get(plan.id+':EVIDENCE'),synthesis:any=taskByKey.get(plan.id+':SYNTHESIS'),
          gate:any=taskByKey.get(plan.id+':HUMAN_GATE'),work:any=taskByKey.get(plan.id+':WORK_PACKAGE'),qa:any=taskByKey.get(plan.id+':QA');
    const add=(a:any,b:any,type:string)=>{if(a&&b)deps.push({user_id:userId,plan_id:plan.id,predecessor_task_id:a.id,successor_task_id:b.id,dependency_type:type})};
    add(evidence,synthesis,'EVIDENCE');add(synthesis,gate,'FINISH_TO_START');add(gate,work,'HUMAN_GATE');add(work,qa,'FINISH_TO_START');
  }
  await bulkInsertIgnore('command_plan_dependencies','plan_id,predecessor_task_id,successor_task_id',deps);

  let ready=0,waitingHuman=0,blockedTasks=0,completeTasks=0;
  for(const [planId,v] of planState.entries()){
    await patchRow('command_plans',planId,{status:v.status,bottleneck:v.bottleneck,summary:v.status==='READY'?'Dependency graph is complete and internally verified. No external execution authority is implied.':'Dependency graph is waiting on one owner decision.',updated_at:now});
    if(v.status==='READY')ready++;else waitingHuman++;
  }
  for(const t of taskRows){if(t.status==='COMPLETE')completeTasks++;if(t.status==='BLOCKED'||t.status==='ESCALATED')blockedTasks++}

  const refreshedEsc=await dbRows('command_planner_escalations?user_id=eq.'+encodeURIComponent(userId)+'&select=*');
  for(const e of refreshedEsc){
    if(e.signal_active!==false&&e.status==='OPEN'){
      events.push({plan_key:plans.find((p:any)=>p.id===e.plan_id)?.plan_key||'UNKNOWN',task_id:e.task_id,event_key:'PLANNER:'+e.escalation_key+':OPEN',event_type:'HUMAN_ESCALATION_OPENED',note:'V177 stopped the dependency graph at an owner decision gate.',evidence:{escalation_key:e.escalation_key,reason:e.reason}});
    }
  }
  for(const [planKey,s] of sourceByPlanKey.entries()){
    const plan:any=planByKey.get(planKey);if(!plan)continue;
    const v=planState.get(plan.id)!;
    events.push({plan_key:planKey,event_key:'PLANNER:'+planKey+':V'+s.version+':'+v.status,event_type:v.status==='READY'?'PLAN_READY':'PLAN_WAITING_HUMAN',note:v.status==='READY'?'All internal planning dependencies are satisfied.':'Planner is waiting for the Architect-Steward.',evidence:{source_fingerprint:s.fingerprint,version:s.version}});
  }
  const eventRows=events.map((e:any)=>{
    const plan:any=planByKey.get(e.plan_key);
    return plan?{user_id:userId,plan_id:plan.id,task_id:e.task_id||null,event_key:e.event_key,event_type:e.event_type,actor:'SYSTEM',note:e.note,evidence:e.evidence,created_at:now}:null;
  }).filter(Boolean);
  await bulkInsertIgnore('command_planner_events','user_id,event_key',eventRows);

  const activeEsc=refreshedEsc.filter((e:any)=>e.signal_active!==false&&e.status!=='RESOLVED').length;
  return{sources:sources.length,compiled,versioned,staled,ready_plans:ready,waiting_human:waitingHuman,complete_tasks:completeTasks,blocked_or_escalated_tasks:blockedTasks,open_escalations:activeEsc,external_effects:0,forbidden_actions:0};
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
      stage='RUNBOOK_SYNC';
      const runbook_sync=await syncRunbooks(owner.user_id,cycle);
      stage='AGENT_WORKFORCE_SYNC';
      const agent_workforce=await syncAgentWorkforce(owner.user_id,cycle);
      stage='MULTI_AGENT_PLANNER_SYNC';
      const multi_agent_planner=await syncMultiAgentPlanner(owner.user_id,cycle,data);
      results.push({user_id:owner.user_id,cycle_date:cycle.cycle_date,changed:cycle.changed,generation_count:cycle.generation_count,state_fingerprint:cycle.state_fingerprint,summary:cycle.summary,anomaly_count:cycle.anomalies.length,human_decision_count:cycle.human_decisions.length,machine_health_pct:cycle.machine_health_pct,sovereign_action:cycle.sovereign_action,capital_permission:cycle.capital_permission,intervention_sync,runbook_sync,agent_workforce,multi_agent_planner});
    }
    return Response.json({ok:true,version:'v177.1-multi-agent-planner-runtime-v1',generated_at:new Date().toISOString(),owners_processed:results.length,results,governance:{planning_only:true,action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false,human_approval_bypassed:false}},{headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V177'}});
  }catch(error){
    console.error('V177_MULTI_AGENT_PLANNER_ERROR',stage,String(error).slice(0,300));
    return Response.json({ok:false,version:'v177.1-multi-agent-planner-runtime-v1',state:'FAIL_CLOSED',error:'executive_cycle_runtime_unavailable',stage,detail:String(error).slice(0,180),governance:{action_permitted:'WAIT',capital_permission:'0R',funds_moved:false,trades_sent:false}},{status:503,headers:{'Cache-Control':'no-store','X-TFA-Runtime':'PRIVATE_BRAIN','X-TFA-Engine':'V177'}});
  }
});
