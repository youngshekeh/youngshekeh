import './styles.css';

const LEDGER_KEY='tfa.v168.command.decisions.v1';
const ORG_KEY='tfa.v169.organization.v1';
const BIZ_KEY='tfa.v170.business.v1';
const ALLOC_KEY='tfa.v171.allocations.v1';
const OUTCOME_KEY='tfa.v172.outcomes.v1';
const CYCLE_KEY='tfa.v173.executive-cycle.v1';
const SUPABASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const SESSION_KEY='tfa_session';
const state={ledger:loadLedger(),org:loadOrg(),biz:loadBiz(),allocations:loadAllocations(),outcomes:loadOutcomes(),executiveCycle:loadExecutiveCycle(),interventions:[],interventionEvents:[],runbooks:[],runbookSteps:[],actionRuns:[],actionEvents:[],agents:[],agentAssignments:[],agentEvents:[],plans:[],planTasks:[],planDependencies:[],plannerEscalations:[],plannerEvents:[],schedulerPolicies:[],scheduleItems:[],schedulerEvents:[],dispatchPolicies:[],dispatchLeases:[],dispatchEvents:[],kernelPolicies:[],kernelRuns:[],kernelState:[],dispatchRetries:[],deadLetters:[],sources:{},lastSync:null,cloud:{token:null,userId:null,state:'LOCAL_ONLY',lastError:null,lastSync:null},orgCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},bizCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},allocCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},outcomeCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},cycleCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},interventionCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},runbookCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},agentCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},plannerCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},schedulerCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},dispatchCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null},kernelCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null}};
const SOURCE_DEFS=[
  {key:'closure',name:'Production Closure',url:'/api/production-closure',critical:true},
  {key:'q4',name:'Q4 Readiness Watch',url:'/api/q4-machine-v9',critical:true},
  {key:'autonomous',name:'Autonomous State',url:'/api/autonomous-state'},
  {key:'quality',name:'Data Quality',url:'/api/data-quality-sentinel',critical:true},
  {key:'gold',name:'Gold Live',url:'/api/gold-live-price'},
  {key:'day',name:'Gold Day State',url:'/api/gold-day-state'},
  {key:'calendar',name:'Macro Calendar',url:'/api/capital-calendar'}
];

function byId(id){return document.getElementById(id)}
function set(id,value){const el=byId(id);if(el)el.textContent=value==null?'—':value}
function esc(v){return String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function uid(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function loadLedger(){try{const v=JSON.parse(localStorage.getItem(LEDGER_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function saveLedger(){localStorage.setItem(LEDGER_KEY,JSON.stringify(state.ledger))}
function loadOrg(){try{const v=JSON.parse(localStorage.getItem(ORG_KEY)||'null');return v&&Array.isArray(v.objectives)&&Array.isArray(v.projects)?v:{objectives:[],projects:[]}}catch{return{objectives:[],projects:[]}}}
function saveOrg(){localStorage.setItem(ORG_KEY,JSON.stringify(state.org))}
function loadBiz(){try{const v=JSON.parse(localStorage.getItem(BIZ_KEY)||'null');return v&&Array.isArray(v.units)&&Array.isArray(v.products)&&Array.isArray(v.channels)?v:{units:[],products:[],channels:[]}}catch{return{units:[],products:[],channels:[]}}}
function saveBiz(){localStorage.setItem(BIZ_KEY,JSON.stringify(state.biz))}
function loadAllocations(){try{const v=JSON.parse(localStorage.getItem(ALLOC_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function saveAllocations(){localStorage.setItem(ALLOC_KEY,JSON.stringify(state.allocations))}
function loadOutcomes(){try{const v=JSON.parse(localStorage.getItem(OUTCOME_KEY)||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function saveOutcomes(){localStorage.setItem(OUTCOME_KEY,JSON.stringify(state.outcomes))}
function loadExecutiveCycle(){try{const v=JSON.parse(localStorage.getItem(CYCLE_KEY)||'null');return v&&typeof v==='object'?v:null}catch{return null}}
function saveExecutiveCycle(){if(state.executiveCycle)localStorage.setItem(CYCLE_KEY,JSON.stringify(state.executiveCycle))}
function download(name,content){const blob=new Blob([content],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
function sessionToken(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')?.access_token||null}catch{return null}}
function cloudTimestamp(x){const value=x?.updatedAt||x?.resolvedAt||x?.createdAt||'';const n=Date.parse(value);return Number.isFinite(n)?n:0}
function toCloudRow(x){
  return{
    user_id:state.cloud.userId,
    client_decision_id:x.id,
    title:String(x.title||'').slice(0,240),
    domain:String(x.domain||'RESEARCH'),
    confidence:Math.max(0,Math.min(100,Math.round(num(x.confidence)))),
    thesis:String(x.thesis||''),
    invalidation:String(x.invalidation||''),
    next_action:String(x.nextAction||''),
    expected_value:String(x.expectedValue||''),
    status:String(x.status||'OPEN'),
    outcome:x.outcome||null,
    lesson:String(x.lesson||''),
    client_created_at:x.createdAt||new Date().toISOString(),
    resolved_at:x.resolvedAt||null,
    updated_at:x.updatedAt||x.resolvedAt||x.createdAt||new Date().toISOString()
  };
}
function fromCloudRow(row){
  return{
    id:row.client_decision_id,
    title:row.title,
    domain:row.domain,
    confidence:String(row.confidence),
    thesis:row.thesis||'',
    invalidation:row.invalidation||'',
    nextAction:row.next_action||'',
    expectedValue:row.expected_value||'',
    status:row.status,
    outcome:row.outcome||null,
    lesson:row.lesson||'',
    createdAt:row.client_created_at||row.created_at,
    resolvedAt:row.resolved_at||null,
    updatedAt:row.updated_at||row.created_at
  };
}
function renderCloudState(){
  const badge=byId('cloud-memory-state'),hero=byId('memory-mode-badge'),copy=byId('cloud-memory-copy');
  const mode=state.cloud.state;
  const cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  if(badge){badge.className='cmd-badge '+cls;badge.textContent=mode.replaceAll('_',' ')}
  if(hero){hero.className='cmd-badge '+cls;hero.textContent=mode==='CLOUD_SYNCED'?'MEMORY · CLOUD SYNCED':'MEMORY · LOCAL FALLBACK'}
  if(copy){
    if(mode==='CLOUD_SYNCED')copy.textContent='Durable Command Memory is synchronized to your authenticated account with Row Level Security. Device cache remains available offline.';
    else if(mode==='SYNCING')copy.textContent='Merging device memory with your authenticated cloud ledger.';
    else if(mode==='CLOUD_ERROR')copy.textContent='Cloud memory is temporarily unavailable. The device ledger remains active and will retry without losing local decisions.';
    else copy.innerHTML='Local fallback is active. <a href="../member/">Sign in as a member</a> to unlock cross-device Command Memory.';
  }
}
async function verifyCloudSession(){
  const token=sessionToken();
  if(!token){state.cloud={token:null,userId:null,state:'LOCAL_ONLY',lastError:null,lastSync:null};renderCloudState();return false}
  try{
    const response=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+token,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
    const user=await response.json().catch(()=>null);
    if(!response.ok||!user?.id)throw new Error('session_invalid');
    state.cloud.token=token;state.cloud.userId=user.id;return true;
  }catch(error){
    state.cloud={token:null,userId:null,state:'LOCAL_ONLY',lastError:String(error),lastSync:null};renderCloudState();return false;
  }
}
async function cloudRows(){
  const response=await fetch(SUPABASE+'/rest/v1/command_decisions?select=*&order=client_created_at.desc',{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'cloud_read_failed');
  return Array.isArray(data)?data:[];
}
async function upsertCloud(items){
  if(!state.cloud.token||!state.cloud.userId||!items.length)return;
  const response=await fetch(SUPABASE+'/rest/v1/command_decisions?on_conflict=user_id,client_decision_id',{
    method:'POST',
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(items.map(toCloudRow)),
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data?.message||'cloud_write_failed')}
}
async function syncItemToCloud(item){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{await upsertCloud([item]);state.cloud.state='CLOUD_SYNCED';state.cloud.lastSync=new Date().toISOString();renderCloudState()}
  catch(error){state.cloud.state='CLOUD_ERROR';state.cloud.lastError=String(error);renderCloudState()}
}
async function deleteCloudItem(id){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{
    const response=await fetch(SUPABASE+'/rest/v1/command_decisions?client_decision_id=eq.'+encodeURIComponent(id),{
      method:'DELETE',
      headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Prefer:'return=minimal'},
      cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error('cloud_delete_failed');
  }catch(error){state.cloud.state='CLOUD_ERROR';state.cloud.lastError=String(error);renderCloudState()}
}
async function syncCloudMemory(){
  state.cloud.state='SYNCING';renderCloudState();
  if(!await verifyCloudSession())return;
  try{
    const remote=(await cloudRows()).map(fromCloudRow);
    const merged=new Map();
    for(const item of state.ledger)merged.set(item.id,item);
    for(const item of remote){
      const local=merged.get(item.id);
      if(!local||cloudTimestamp(item)>=cloudTimestamp(local))merged.set(item.id,item);
    }
    state.ledger=[...merged.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    saveLedger();
    await upsertCloud(state.ledger);
    state.cloud.state='CLOUD_SYNCED';state.cloud.lastError=null;state.cloud.lastSync=new Date().toISOString();
    renderAll();renderCloudState();
  }catch(error){
    state.cloud.state='CLOUD_ERROR';state.cloud.lastError=String(error);renderCloudState();renderAll();
  }
}

function renderOrgCloudState(){
  const badge=byId('org-cloud-state');if(!badge)return;
  const mode=state.orgCloud.state,cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  badge.className='cmd-badge '+cls;
  badge.textContent=(mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':'LOCAL FALLBACK');
}
function objectiveToCloud(x){
  return{user_id:state.cloud.userId,client_objective_id:x.id,title:String(x.title||'').slice(0,240),horizon:x.horizon||'NOW',priority:Math.max(1,Math.min(5,Math.round(num(x.priority)||3))),status:x.status||'ACTIVE',target_metric:String(x.targetMetric||''),target_value:String(x.targetValue||''),current_value:String(x.currentValue||''),owner_role:'ARCHITECT',due_date:x.dueDate||null,notes:String(x.notes||''),client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function projectToCloud(x){
  return{user_id:state.cloud.userId,client_project_id:x.id,objective_client_id:x.objectiveId||null,title:String(x.title||'').slice(0,240),domain:x.domain||'PRODUCT',status:x.status||'ACTIVE',impact:Math.max(1,Math.min(5,Math.round(num(x.impact)||3))),effort:Math.max(1,Math.min(5,Math.round(num(x.effort)||3))),confidence:Math.max(0,Math.min(100,Math.round(num(x.confidence)||0))),allocation_weight:Math.max(0,Math.min(100,Math.round(num(x.allocationWeight)||0))),next_action:String(x.nextAction||''),blocker:String(x.blocker||''),due_date:x.dueDate||null,client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function objectiveFromCloud(r){return{id:r.client_objective_id,title:r.title,horizon:r.horizon,priority:String(r.priority),status:r.status,targetMetric:r.target_metric||'',targetValue:r.target_value||'',currentValue:r.current_value||'',dueDate:r.due_date||'',notes:r.notes||'',createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
function projectFromCloud(r){return{id:r.client_project_id,objectiveId:r.objective_client_id||'',title:r.title,domain:r.domain,status:r.status,impact:String(r.impact),effort:String(r.effort),confidence:String(r.confidence),allocationWeight:String(r.allocation_weight),nextAction:r.next_action||'',blocker:r.blocker||'',dueDate:r.due_date||'',createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
async function restRows(table){
  const response=await fetch(SUPABASE+'/rest/v1/'+table+'?select=*&order=client_created_at.desc',{headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||table+'_read_failed');
  return Array.isArray(data)?data:[];
}
async function upsertOrgRows(table,conflict,rows){
  if(!state.cloud.token||!state.cloud.userId||!rows.length)return;
  const response=await fetch(SUPABASE+'/rest/v1/'+table+'?on_conflict='+encodeURIComponent(conflict),{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data?.message||table+'_write_failed')}
}
async function syncOrganization(){
  state.orgCloud.state='SYNCING';renderOrgCloudState();
  if(!await verifyCloudSession()){state.orgCloud.state='LOCAL_ONLY';renderOrgCloudState();return}
  try{
    const [ro,rp]=await Promise.all([restRows('command_objectives'),restRows('command_projects')]);
    const om=new Map(state.org.objectives.map(x=>[x.id,x]));
    for(const x of ro.map(objectiveFromCloud)){const local=om.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))om.set(x.id,x)}
    const pm=new Map(state.org.projects.map(x=>[x.id,x]));
    for(const x of rp.map(projectFromCloud)){const local=pm.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))pm.set(x.id,x)}
    state.org={objectives:[...om.values()],projects:[...pm.values()]};saveOrg();
    await Promise.all([
      upsertOrgRows('command_objectives','user_id,client_objective_id',state.org.objectives.map(objectiveToCloud)),
      upsertOrgRows('command_projects','user_id,client_project_id',state.org.projects.map(projectToCloud))
    ]);
    state.orgCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderAll();renderOrgCloudState();
  }catch(error){state.orgCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.orgCloud.lastSync};renderOrgCloudState();renderAll()}
}
async function syncOrgItem(kind,item){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{
    if(kind==='objective')await upsertOrgRows('command_objectives','user_id,client_objective_id',[objectiveToCloud(item)]);
    else await upsertOrgRows('command_projects','user_id,client_project_id',[projectToCloud(item)]);
    state.orgCloud.state='CLOUD_SYNCED';state.orgCloud.lastSync=new Date().toISOString();renderOrgCloudState();
  }catch(error){state.orgCloud.state='CLOUD_ERROR';state.orgCloud.lastError=String(error);renderOrgCloudState()}
}
async function deleteOrgCloud(kind,id){
  if(!state.cloud.token||!state.cloud.userId)return;
  const table=kind==='objective'?'command_objectives':'command_projects',field=kind==='objective'?'client_objective_id':'client_project_id';
  try{
    const response=await fetch(SUPABASE+'/rest/v1/'+table+'?'+field+'=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Prefer:'return=minimal'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(table+'_delete_failed');
  }catch(error){state.orgCloud.state='CLOUD_ERROR';state.orgCloud.lastError=String(error);renderOrgCloudState()}
}
function linkedObjective(project){return state.org.objectives.find(x=>x.id===project.objectiveId)||null}
function projectScore(project){
  const objective=linkedObjective(project),priority=num(objective?.priority)||3,feedback=outcomeFeedback('PROJECT',project.id);
  let score=num(project.impact)*12+num(project.confidence)*0.25+priority*6-num(project.effort)*6;
  if(feedback!==null)score+=(feedback-50)*0.2;
  if(project.status==='BLOCKED'||String(project.blocker||'').trim())score-=20;
  if(project.status==='DEFERRED')score-=25;
  if(project.dueDate&&new Date(project.dueDate+'T23:59:59').getTime()<Date.now()&&!['COMPLETE','KILLED'].includes(project.status))score-=10;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function organizationMetrics(){
  const activeObjectives=state.org.objectives.filter(x=>x.status==='ACTIVE');
  const activeProjects=state.org.projects.filter(x=>['ACTIVE','PLANNED','BLOCKED'].includes(x.status));
  const blocked=activeProjects.filter(x=>x.status==='BLOCKED'||String(x.blocker||'').trim());
  const overdue=activeProjects.filter(x=>x.dueDate&&new Date(x.dueDate+'T23:59:59').getTime()<Date.now());
  const low=activeProjects.filter(x=>num(x.confidence)<40);
  const unlinked=activeProjects.filter(x=>!x.objectiveId);
  const focus=Math.max(0,Math.min(100,100-Math.max(0,activeProjects.length-5)*8-blocked.length*15-overdue.length*8-low.length*8-unlinked.length*4));
  return{activeObjectives,activeProjects,blocked,overdue,low,unlinked,focus};
}

function attentionRoutes(){
  const live=state.org.projects.filter(x=>!['COMPLETE','KILLED'].includes(x.status));
  const ranked=live.slice().sort((a,b)=>projectScore(b)-projectScore(a));
  const review=ranked.filter(x=>projectScore(x)<35||(num(x.confidence)<35&&num(x.effort)>=4)||(x.status==='BLOCKED'&&x.dueDate&&new Date(x.dueDate+'T23:59:59').getTime()<Date.now()));
  const reviewIds=new Set(review.map(x=>x.id));
  const eligible=ranked.filter(x=>!reviewIds.has(x.id));
  const now=eligible.filter(x=>x.status==='ACTIVE'||x.status==='BLOCKED').slice(0,2);
  const nowIds=new Set(now.map(x=>x.id));
  const next=eligible.filter(x=>!nowIds.has(x.id)&&(x.status==='ACTIVE'||x.status==='PLANNED')).slice(0,3);
  const used=new Set([...nowIds,...next.map(x=>x.id),...reviewIds]);
  const later=ranked.filter(x=>!used.has(x.id)||x.status==='DEFERRED').slice(0,4);
  return{now,next,later,review};
}
function routeHtml(items,empty){
  return items.length?items.map(x=>'<div class="route-item">'+esc(x.title)+'<small>'+projectScore(x)+'/100 · '+esc(x.status)+(x.nextAction?' · '+esc(x.nextAction):'')+'</small></div>').join(''):'<div class="route-item"><small>'+esc(empty)+'</small></div>';
}
function renderAttentionRouter(){
  const r=attentionRoutes(),m=organizationMetrics();
  const now=byId('route-now'),next=byId('route-next'),later=byId('route-later'),review=byId('route-review');
  if(now)now.innerHTML=routeHtml(r.now,'No project currently earns NOW attention.');
  if(next)next.innerHTML=routeHtml(r.next,'No queued NEXT work.');
  if(later)later.innerHTML=routeHtml(r.later,'No lower-priority work is waiting.');
  if(review)review.innerHTML=routeHtml(r.review,'No project currently meets review thresholds.');
  const founder=r.review.find(x=>x.status==='BLOCKED')||r.now[0]||null;
  set('architect-one-thing',founder?(founder.status==='BLOCKED'?'Remove the constraint on '+founder.title+'.':'Protect attention for '+founder.title+'. Do not open new work until its next action is clear.'):'No founder-level project decision is surfaced. Preserve optionality.');
  set('system-autonomy-brief','The system can rank '+m.activeProjects.length+' active project'+(m.activeProjects.length===1?'':'s')+', track '+m.blocked.length+' blocker'+(m.blocked.length===1?'':'s')+', watch deadlines, sync memory, and update the command queue. It does not execute external project actions or release capital by itself.');
}

function renderOrganization(){
  const m=organizationMetrics();set('org-objectives-kpi',String(m.activeObjectives.length));set('org-projects-kpi',String(m.activeProjects.length));set('org-blocked-kpi',String(m.blocked.length));set('org-focus-kpi',m.focus+'%');
  const ranked=m.activeProjects.slice().sort((a,b)=>projectScore(b)-projectScore(a));
  const weights=m.activeProjects.reduce((s,x)=>s+num(x.allocationWeight),0);
  const top=ranked[0];
  let brief='Active objectives: '+m.activeObjectives.length+'. Active projects: '+m.activeProjects.length+'. ';
  if(m.blocked.length)brief+=m.blocked.length+' project'+(m.blocked.length===1?' is':'s are')+' blocked. ';
  if(m.overdue.length)brief+=m.overdue.length+' active item'+(m.overdue.length===1?' is':'s are')+' overdue. ';
  brief+=top?'Highest-priority work: '+top.title+' ('+projectScore(top)+'/100). ':'No active project currently earns priority. ';
  brief+=weights>100?'Attention weights total '+weights+'%, so the portfolio is overcommitted. ':weights>0?'Declared attention weights total '+weights+'%. ':'No explicit attention weights are assigned yet. ';
  brief+='Focus score is '+m.focus+'/100. This is an operating-priority score, not financial performance or capital permission.';
  set('org-brief',brief);

  const select=byId('project-objective');
  if(select){
    const current=select.value;
    select.innerHTML='<option value="">UNLINKED</option>'+state.org.objectives.filter(x=>x.status==='ACTIVE').sort((a,b)=>num(b.priority)-num(a.priority)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('');
    if([...select.options].some(o=>o.value===current))select.value=current;
  }

  const oh=byId('objective-list');
  if(oh){
    const rows=state.org.objectives.slice().sort((a,b)=>num(b.priority)-num(a.priority)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999')));
    oh.innerHTML=rows.length?rows.map(x=>'<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.title)+'</div><div class="org-meta">'+esc(x.horizon)+' · PRIORITY '+esc(x.priority)+' · '+esc(x.status)+(x.dueDate?' · due '+esc(x.dueDate):'')+'</div></div><div class="org-score">P'+esc(x.priority)+'</div></div><div class="org-meta">'+esc(x.targetMetric||'No metric')+(x.targetValue?' · target '+esc(x.targetValue):'')+(x.currentValue?' · current '+esc(x.currentValue):'')+'</div><div class="org-actions">'+(x.status==='ACTIVE'?'<button class="cmd-btn mini" data-objective-status="'+esc(x.id)+'" data-status="PAUSED">PAUSE</button><button class="cmd-btn mini" data-objective-status="'+esc(x.id)+'" data-status="COMPLETE">COMPLETE</button>':'<button class="cmd-btn mini" data-objective-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVATE</button>')+'<button class="cmd-btn mini danger" data-objective-status="'+esc(x.id)+'" data-status="KILLED">KILL</button><button class="cmd-btn mini danger" data-objective-delete="'+esc(x.id)+'">DELETE</button></div></article>').join(''):'<div class="empty">No objectives yet. Create the first measurable outcome above.</div>';
  }
  const ph=byId('project-list');
  if(ph){
    const rows=state.org.projects.slice().sort((a,b)=>projectScore(b)-projectScore(a));
    ph.innerHTML=rows.length?rows.map(x=>{const obj=linkedObjective(x),score=projectScore(x);return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.title)+'</div><div class="org-meta">'+esc(x.domain)+' · '+esc(x.status)+' · '+(obj?'objective: '+esc(obj.title):'UNLINKED')+'</div></div><div class="org-score">'+score+'</div></div><div class="org-meta">Impact '+esc(x.impact)+'/5 · effort '+esc(x.effort)+'/5 · confidence '+esc(x.confidence)+'% · attention '+esc(x.allocationWeight||0)+'%'+(x.blocker?' · blocker: '+esc(x.blocker):'')+(x.nextAction?' · next: '+esc(x.nextAction):'')+'</div><div class="org-actions">'+(!['COMPLETE','KILLED'].includes(x.status)?'<button class="cmd-btn mini" data-project-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVE</button><button class="cmd-btn mini" data-project-status="'+esc(x.id)+'" data-status="BLOCKED">BLOCK</button><button class="cmd-btn mini" data-project-status="'+esc(x.id)+'" data-status="DEFERRED">DEFER</button><button class="cmd-btn mini" data-project-status="'+esc(x.id)+'" data-status="COMPLETE">DONE</button>':'')+'<button class="cmd-btn mini danger" data-project-status="'+esc(x.id)+'" data-status="KILLED">KILL</button><button class="cmd-btn mini danger" data-project-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No projects yet. Add work only when it serves an objective or explicit experiment.</div>';
  }

  document.querySelectorAll('[data-objective-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.org.objectives.find(v=>v.id===btn.dataset.objectiveStatus);if(!x)return;x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveOrg();renderAll();void syncOrgItem('objective',x)}));
  document.querySelectorAll('[data-project-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.org.projects.find(v=>v.id===btn.dataset.projectStatus);if(!x)return;if(btn.dataset.status==='BLOCKED'&&!String(x.blocker||'').trim())x.blocker=(prompt('What is blocking this project?')||'BLOCKER_UNSPECIFIED').trim();x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveOrg();renderAll();void syncOrgItem('project',x)}));
  document.querySelectorAll('[data-objective-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.objectiveDelete;state.org.objectives=state.org.objectives.filter(x=>x.id!==id);state.org.projects=state.org.projects.map(x=>x.objectiveId===id?{...x,objectiveId:'',updatedAt:new Date().toISOString()}:x);saveOrg();renderAll();void deleteOrgCloud('objective',id)}));
  document.querySelectorAll('[data-project-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.projectDelete;state.org.projects=state.org.projects.filter(x=>x.id!==id);saveOrg();renderAll();void deleteOrgCloud('project',id)}));
}
function setupOrganization(){
  byId('objective-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();const item={...row,id:uid(),status:'ACTIVE',createdAt:now,updatedAt:now};state.org.objectives.push(item);saveOrg();e.currentTarget.reset();const p=e.currentTarget.querySelector('[name=priority]');if(p)p.value='3';renderAll();void syncOrgItem('objective',item)});
  byId('project-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();const item={...row,id:uid(),createdAt:now,updatedAt:now};state.org.projects.push(item);saveOrg();e.currentTarget.reset();const impact=e.currentTarget.querySelector('[name=impact]'),effort=e.currentTarget.querySelector('[name=effort]'),confidence=e.currentTarget.querySelector('[name=confidence]'),weight=e.currentTarget.querySelector('[name=allocationWeight]');if(impact)impact.value='3';if(effort)effort.value='3';if(confidence)confidence.value='60';if(weight)weight.value='0';renderAll();void syncOrgItem('project',item)});
  byId('sync-organization')?.addEventListener('click',()=>void syncOrganization());
}


function renderBizCloudState(){
  const badge=byId('biz-cloud-state');if(!badge)return;
  const mode=state.bizCloud.state,cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  badge.className='cmd-badge '+cls;
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':'LOCAL FALLBACK';
}
function optionalNumber(v){return v===''||v===null||v===undefined?null:num(v)}
function toBizRow(x){
  return{user_id:state.cloud.userId,client_business_id:x.id,name:String(x.name||'').slice(0,240),category:x.category||'OTHER',status:x.status||'ACTIVE',strategic_priority:Math.max(1,Math.min(5,Math.round(num(x.strategicPriority)||3))),currency:String(x.currency||'USD').toUpperCase().slice(0,3),revenue_30d:optionalNumber(x.revenue30d),cost_30d:optionalNumber(x.cost30d),growth_pct:optionalNumber(x.growthPct),customers:x.customers===''||x.customers==null?null:Math.max(0,Math.round(num(x.customers))),primary_metric:String(x.primaryMetric||''),primary_metric_value:String(x.primaryMetricValue||''),next_action:String(x.nextAction||''),blocker:String(x.blocker||''),client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function fromBizRow(r){return{id:r.client_business_id,name:r.name,category:r.category,status:r.status,strategicPriority:String(r.strategic_priority),currency:r.currency||'USD',revenue30d:r.revenue_30d==null?'':String(r.revenue_30d),cost30d:r.cost_30d==null?'':String(r.cost_30d),growthPct:r.growth_pct==null?'':String(r.growth_pct),customers:r.customers==null?'':String(r.customers),primaryMetric:r.primary_metric||'',primaryMetricValue:r.primary_metric_value||'',nextAction:r.next_action||'',blocker:r.blocker||'',createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
function toProductRow(x){
  return{user_id:state.cloud.userId,client_product_id:x.id,business_client_id:x.businessId||null,name:String(x.name||'').slice(0,240),product_type:x.productType||'OTHER',status:x.status||'ACTIVE',strategic_priority:Math.max(1,Math.min(5,Math.round(num(x.strategicPriority)||3))),currency:String(x.currency||'USD').toUpperCase().slice(0,3),price:optionalNumber(x.price),revenue_30d:optionalNumber(x.revenue30d),users_30d:x.users30d===''||x.users30d==null?null:Math.max(0,Math.round(num(x.users30d))),conversion_pct:optionalNumber(x.conversionPct),margin_pct:optionalNumber(x.marginPct),next_action:String(x.nextAction||''),blocker:String(x.blocker||''),client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function fromProductRow(r){return{id:r.client_product_id,businessId:r.business_client_id||'',name:r.name,productType:r.product_type,status:r.status,strategicPriority:String(r.strategic_priority),currency:r.currency||'USD',price:r.price==null?'':String(r.price),revenue30d:r.revenue_30d==null?'':String(r.revenue_30d),users30d:r.users_30d==null?'':String(r.users_30d),conversionPct:r.conversion_pct==null?'':String(r.conversion_pct),marginPct:r.margin_pct==null?'':String(r.margin_pct),nextAction:r.next_action||'',blocker:r.blocker||'',createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
function toChannelRow(x){
  return{user_id:state.cloud.userId,client_channel_id:x.id,business_client_id:x.businessId||null,product_client_id:x.productId||null,name:String(x.name||'').slice(0,240),channel_type:x.channelType||'OTHER',status:x.status||'ACTIVE',currency:String(x.currency||'USD').toUpperCase().slice(0,3),audience:x.audience===''||x.audience==null?null:Math.max(0,Math.round(num(x.audience))),leads_30d:x.leads30d===''||x.leads30d==null?null:Math.max(0,Math.round(num(x.leads30d))),conversions_30d:x.conversions30d===''||x.conversions30d==null?null:Math.max(0,Math.round(num(x.conversions30d))),revenue_30d:optionalNumber(x.revenue30d),cost_30d:optionalNumber(x.cost30d),next_action:String(x.nextAction||''),client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function fromChannelRow(r){return{id:r.client_channel_id,businessId:r.business_client_id||'',productId:r.product_client_id||'',name:r.name,channelType:r.channel_type,status:r.status,currency:r.currency||'USD',audience:r.audience==null?'':String(r.audience),leads30d:r.leads_30d==null?'':String(r.leads_30d),conversions30d:r.conversions_30d==null?'':String(r.conversions_30d),revenue30d:r.revenue_30d==null?'':String(r.revenue_30d),cost30d:r.cost_30d==null?'':String(r.cost_30d),nextAction:r.next_action||'',createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
async function syncBusinessBrain(){
  state.bizCloud.state='SYNCING';renderBizCloudState();
  if(!await verifyCloudSession()){state.bizCloud.state='LOCAL_ONLY';renderBizCloudState();return}
  try{
    const [bu,pr,ch]=await Promise.all([restRows('command_business_units'),restRows('command_products'),restRows('command_distribution_channels')]);
    const um=new Map(state.biz.units.map(x=>[x.id,x]));for(const x of bu.map(fromBizRow)){const local=um.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))um.set(x.id,x)}
    const pm=new Map(state.biz.products.map(x=>[x.id,x]));for(const x of pr.map(fromProductRow)){const local=pm.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))pm.set(x.id,x)}
    const cm=new Map(state.biz.channels.map(x=>[x.id,x]));for(const x of ch.map(fromChannelRow)){const local=cm.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))cm.set(x.id,x)}
    state.biz={units:[...um.values()],products:[...pm.values()],channels:[...cm.values()]};saveBiz();
    await Promise.all([
      upsertOrgRows('command_business_units','user_id,client_business_id',state.biz.units.map(toBizRow)),
      upsertOrgRows('command_products','user_id,client_product_id',state.biz.products.map(toProductRow)),
      upsertOrgRows('command_distribution_channels','user_id,client_channel_id',state.biz.channels.map(toChannelRow))
    ]);
    state.bizCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderAll();renderBizCloudState();
  }catch(error){state.bizCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.bizCloud.lastSync};renderBizCloudState();renderAll()}
}
async function syncBizItem(kind,item){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{
    if(kind==='business')await upsertOrgRows('command_business_units','user_id,client_business_id',[toBizRow(item)]);
    if(kind==='product')await upsertOrgRows('command_products','user_id,client_product_id',[toProductRow(item)]);
    if(kind==='channel')await upsertOrgRows('command_distribution_channels','user_id,client_channel_id',[toChannelRow(item)]);
    state.bizCloud.state='CLOUD_SYNCED';state.bizCloud.lastSync=new Date().toISOString();renderBizCloudState();
  }catch(error){state.bizCloud.state='CLOUD_ERROR';state.bizCloud.lastError=String(error);renderBizCloudState()}
}
async function deleteBizCloud(kind,id){
  if(!state.cloud.token||!state.cloud.userId)return;
  const config=kind==='business'?['command_business_units','client_business_id']:kind==='product'?['command_products','client_product_id']:['command_distribution_channels','client_channel_id'];
  try{
    const response=await fetch(SUPABASE+'/rest/v1/'+config[0]+'?'+config[1]+'=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Prefer:'return=minimal'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(config[0]+'_delete_failed');
  }catch(error){state.bizCloud.state='CLOUD_ERROR';state.bizCloud.lastError=String(error);renderBizCloudState()}
}
function linkedBusiness(id){return state.biz.units.find(x=>x.id===id)||null}
function linkedProduct(id){return state.biz.products.find(x=>x.id===id)||null}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function businessScore(x){
  const rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d),growth=optionalNumber(x.growthPct),feedback=outcomeFeedback('BUSINESS',x.id);
  const margin=rev!==null&&rev>0&&cost!==null?(rev-cost)/rev*100:null;
  let score=num(x.strategicPriority)*12+(x.status==='ACTIVE'?12:x.status==='INCUBATING'?6:0)+(growth===null?0:clamp(growth,-50,50)*0.25)+(margin===null?0:clamp(margin,-100,100)*0.18)+(x.nextAction?4:0);
  if(feedback!==null)score+=(feedback-50)*0.2;
  if(x.blocker)score-=18;if(x.status==='EXIT_REVIEW')score-=20;if(x.status==='PAUSED')score-=15;
  return clamp(Math.round(score),0,100);
}
function productScore(x){
  const margin=optionalNumber(x.marginPct),conv=optionalNumber(x.conversionPct),feedback=outcomeFeedback('PRODUCT',x.id);
  let score=num(x.strategicPriority)*12+(x.status==='ACTIVE'?12:x.status==='BUILDING'?6:0)+(margin===null?0:clamp(margin,-100,100)*0.16)+(conv===null?0:clamp(conv,0,100)*0.22)+(optionalNumber(x.revenue30d)!==null?5:0)+(x.nextAction?4:0);
  if(feedback!==null)score+=(feedback-50)*0.2;
  if(x.blocker)score-=18;if(x.status==='KILL_REVIEW')score-=24;if(x.status==='PAUSED')score-=15;
  return clamp(Math.round(score),0,100);
}
function channelScore(x){
  const leads=optionalNumber(x.leads30d),conversions=optionalNumber(x.conversions30d),rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d),feedback=outcomeFeedback('CHANNEL',x.id);
  const cvr=leads!==null&&leads>0&&conversions!==null?conversions/leads*100:null;
  const roi=cost!==null&&cost>0&&rev!==null?(rev-cost)/cost*100:null;
  let score=(x.status==='ACTIVE'?35:x.status==='TESTING'?24:8)+(cvr===null?0:clamp(cvr,0,100)*0.35)+(roi===null?0:clamp(roi,-100,300)*0.08)+(conversions!==null&&conversions>0?8:0)+(x.nextAction?4:0);
  if(feedback!==null)score+=(feedback-50)*0.2;
  if(x.status==='STOPPED')score-=30;if(x.status==='PAUSED')score-=15;
  return clamp(Math.round(score),0,100);
}
function moneySummary(){
  const buckets={};
  for(const x of state.biz.units.filter(v=>v.status==='ACTIVE')){
    const c=String(x.currency||'USD').toUpperCase(),rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d);
    if(!buckets[c])buckets[c]={revenue:0,cost:0,hasRevenue:false,hasCost:false};
    if(rev!==null){buckets[c].revenue+=rev;buckets[c].hasRevenue=true}
    if(cost!==null){buckets[c].cost+=cost;buckets[c].hasCost=true}
  }
  const parts=Object.entries(buckets).map(([c,v])=>c+' rev '+(v.hasRevenue?v.revenue.toLocaleString():'—')+' / cost '+(v.hasCost?v.cost.toLocaleString():'—'));
  return parts.length?parts.join(' · '):'No 30-day business financials recorded yet.';
}
function renderBusinessBrain(){
  const activeUnits=state.biz.units.filter(x=>x.status==='ACTIVE'),activeProducts=state.biz.products.filter(x=>x.status==='ACTIVE'),activeChannels=state.biz.channels.filter(x=>x.status==='ACTIVE'||x.status==='TESTING');
  const blockers=[...state.biz.units.filter(x=>x.blocker),...state.biz.products.filter(x=>x.blocker)];
  set('biz-units-kpi',String(activeUnits.length));set('biz-products-kpi',String(activeProducts.length));set('biz-channels-kpi',String(activeChannels.length));set('biz-blockers-kpi',String(blockers.length));
  const topUnit=activeUnits.slice().sort((a,b)=>businessScore(b)-businessScore(a))[0],topProduct=state.biz.products.filter(x=>!['ARCHIVED'].includes(x.status)).slice().sort((a,b)=>productScore(b)-productScore(a))[0],topChannel=state.biz.channels.filter(x=>!['STOPPED'].includes(x.status)).slice().sort((a,b)=>channelScore(b)-channelScore(a))[0];
  let brief='Portfolio: '+activeUnits.length+' active business unit'+(activeUnits.length===1?'':'s')+', '+activeProducts.length+' active product'+(activeProducts.length===1?'':'s')+', '+activeChannels.length+' live/test channel'+(activeChannels.length===1?'':'s')+'. ';
  brief+=topUnit?'Top business attention: '+topUnit.name+' ('+businessScore(topUnit)+'/100). ':'No business unit is ranked yet. ';
  brief+=topProduct?'Top product: '+topProduct.name+' ('+productScore(topProduct)+'/100). ':'No product is ranked yet. ';
  brief+=topChannel?'Best measured channel: '+topChannel.name+' ('+channelScore(topChannel)+'/100). ':'No channel efficiency signal yet. ';
  if(blockers.length)brief+=blockers.length+' commercial blocker'+(blockers.length===1?' requires':'s require')+' attention. ';
  brief+=moneySummary()+'. Currency totals are never merged across ISO currencies.';
  set('biz-brief',brief);

  const businessOptions='<option value="">UNLINKED</option>'+state.biz.units.filter(x=>!['ARCHIVED'].includes(x.status)).sort((a,b)=>businessScore(b)-businessScore(a)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  for(const id of ['product-business','channel-business']){const el=byId(id);if(el){const v=el.value;el.innerHTML=businessOptions;if([...el.options].some(o=>o.value===v))el.value=v}}
  const productSelect=byId('channel-product');if(productSelect){const v=productSelect.value;productSelect.innerHTML='<option value="">UNLINKED</option>'+state.biz.products.filter(x=>!['ARCHIVED'].includes(x.status)).sort((a,b)=>productScore(b)-productScore(a)).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');if([...productSelect.options].some(o=>o.value===v))productSelect.value=v}

  const bh=byId('business-list');if(bh){const rows=state.biz.units.slice().sort((a,b)=>businessScore(b)-businessScore(a));bh.innerHTML=rows.length?rows.map(x=>{const rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d),margin=rev!==null&&rev>0&&cost!==null?(rev-cost)/rev*100:null;return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.name)+'</div><div class="org-meta">'+esc(x.category)+' · '+esc(x.status)+' · P'+esc(x.strategicPriority)+' · '+esc(x.currency)+'</div></div><div class="org-score">'+businessScore(x)+'</div></div><div class="org-meta">30D revenue '+(rev===null?'—':esc(rev.toLocaleString()))+' · cost '+(cost===null?'—':esc(cost.toLocaleString()))+' · margin '+(margin===null?'—':esc(margin.toFixed(1)+'%'))+(x.growthPct!==''?' · growth '+esc(x.growthPct)+'%':'')+(x.primaryMetric?' · '+esc(x.primaryMetric)+' '+esc(x.primaryMetricValue):'')+(x.blocker?' · blocker: '+esc(x.blocker):'')+'</div><div class="org-actions"><button class="cmd-btn mini" data-business-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVE</button><button class="cmd-btn mini" data-business-status="'+esc(x.id)+'" data-status="PAUSED">PAUSE</button><button class="cmd-btn mini danger" data-business-status="'+esc(x.id)+'" data-status="EXIT_REVIEW">EXIT REVIEW</button><button class="cmd-btn mini danger" data-business-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No business units yet. Add the portfolio above without mixing currencies.</div>'}
  const ph=byId('product-stack');if(ph){const rows=state.biz.products.slice().sort((a,b)=>productScore(b)-productScore(a));ph.innerHTML=rows.length?rows.map(x=>{const b=linkedBusiness(x.businessId);return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.name)+'</div><div class="org-meta">'+esc(x.productType)+' · '+esc(x.status)+' · '+(b?esc(b.name):'UNLINKED')+'</div></div><div class="org-score">'+productScore(x)+'</div></div><div class="org-meta">'+esc(x.currency)+' · price '+(x.price||'—')+' · revenue 30D '+(x.revenue30d||'—')+' · users '+(x.users30d||'—')+' · conversion '+(x.conversionPct||'—')+'% · margin '+(x.marginPct||'—')+'%'+(x.blocker?' · blocker: '+esc(x.blocker):'')+'</div><div class="org-actions"><button class="cmd-btn mini" data-product-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVE</button><button class="cmd-btn mini" data-product-status="'+esc(x.id)+'" data-status="PAUSED">PAUSE</button><button class="cmd-btn mini danger" data-product-status="'+esc(x.id)+'" data-status="KILL_REVIEW">KILL REVIEW</button><button class="cmd-btn mini danger" data-product-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No products yet. Products should connect intelligence to repeatable value.</div>'}
  const ch=byId('channel-stack');if(ch){const rows=state.biz.channels.slice().sort((a,b)=>channelScore(b)-channelScore(a));ch.innerHTML=rows.length?rows.map(x=>{const b=linkedBusiness(x.businessId),p=linkedProduct(x.productId),leads=optionalNumber(x.leads30d),conv=optionalNumber(x.conversions30d),cvr=leads!==null&&leads>0&&conv!==null?conv/leads*100:null;return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.name)+'</div><div class="org-meta">'+esc(x.channelType)+' · '+esc(x.status)+' · '+(p?esc(p.name):b?esc(b.name):'UNLINKED')+'</div></div><div class="org-score">'+channelScore(x)+'</div></div><div class="org-meta">Audience '+(x.audience||'—')+' · leads '+(x.leads30d||'—')+' · conversions '+(x.conversions30d||'—')+' · CVR '+(cvr===null?'—':cvr.toFixed(1)+'%')+' · '+esc(x.currency)+' revenue '+(x.revenue30d||'—')+' / cost '+(x.cost30d||'—')+'</div><div class="org-actions"><button class="cmd-btn mini" data-channel-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVE</button><button class="cmd-btn mini" data-channel-status="'+esc(x.id)+'" data-status="TESTING">TEST</button><button class="cmd-btn mini" data-channel-status="'+esc(x.id)+'" data-status="PAUSED">PAUSE</button><button class="cmd-btn mini danger" data-channel-status="'+esc(x.id)+'" data-status="STOPPED">STOP</button><button class="cmd-btn mini danger" data-channel-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No channels yet. Add the paths that actually move attention into products.</div>'}

  document.querySelectorAll('[data-business-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.biz.units.find(v=>v.id===btn.dataset.businessStatus);if(!x)return;x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveBiz();renderAll();void syncBizItem('business',x)}));
  document.querySelectorAll('[data-product-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.biz.products.find(v=>v.id===btn.dataset.productStatus);if(!x)return;x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveBiz();renderAll();void syncBizItem('product',x)}));
  document.querySelectorAll('[data-channel-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.biz.channels.find(v=>v.id===btn.dataset.channelStatus);if(!x)return;x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveBiz();renderAll();void syncBizItem('channel',x)}));
  document.querySelectorAll('[data-business-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.businessDelete;state.biz.units=state.biz.units.filter(x=>x.id!==id);state.biz.products=state.biz.products.map(x=>x.businessId===id?{...x,businessId:'',updatedAt:new Date().toISOString()}:x);state.biz.channels=state.biz.channels.map(x=>x.businessId===id?{...x,businessId:'',updatedAt:new Date().toISOString()}:x);saveBiz();renderAll();void deleteBizCloud('business',id)}));
  document.querySelectorAll('[data-product-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.productDelete;state.biz.products=state.biz.products.filter(x=>x.id!==id);state.biz.channels=state.biz.channels.map(x=>x.productId===id?{...x,productId:'',updatedAt:new Date().toISOString()}:x);saveBiz();renderAll();void deleteBizCloud('product',id)}));
  document.querySelectorAll('[data-channel-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.channelDelete;state.biz.channels=state.biz.channels.filter(x=>x.id!==id);saveBiz();renderAll();void deleteBizCloud('channel',id)}));
}
function setupBusinessBrain(){
  byId('business-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();row.currency=String(row.currency||'USD').toUpperCase();const item={...row,id:uid(),createdAt:now,updatedAt:now};state.biz.units.push(item);saveBiz();e.currentTarget.reset();const p=e.currentTarget.querySelector('[name=strategicPriority]'),c=e.currentTarget.querySelector('[name=currency]');if(p)p.value='3';if(c)c.value='USD';renderAll();void syncBizItem('business',item)});
  byId('product-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();row.currency=String(row.currency||'USD').toUpperCase();const item={...row,id:uid(),createdAt:now,updatedAt:now};state.biz.products.push(item);saveBiz();e.currentTarget.reset();const p=e.currentTarget.querySelector('[name=strategicPriority]'),c=e.currentTarget.querySelector('[name=currency]');if(p)p.value='3';if(c)c.value='USD';renderAll();void syncBizItem('product',item)});
  byId('channel-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();row.currency=String(row.currency||'USD').toUpperCase();const item={...row,id:uid(),createdAt:now,updatedAt:now};state.biz.channels.push(item);saveBiz();e.currentTarget.reset();const c=e.currentTarget.querySelector('[name=currency]');if(c)c.value='USD';renderAll();void syncBizItem('channel',item)});
  byId('sync-business')?.addEventListener('click',()=>void syncBusinessBrain());
}


function renderAllocCloudState(){
  const badge=byId('allocation-cloud-state');if(!badge)return;
  const mode=state.allocCloud.state,cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  badge.className='cmd-badge '+cls;badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':'LOCAL FALLBACK';
}
function allocationToCloud(x){
  return{user_id:state.cloud.userId,client_allocation_id:x.id,business_client_id:x.businessId||null,product_client_id:x.productId||null,allocation_type:x.allocationType||'ATTENTION',status:x.status||'PROPOSED',weight_pct:optionalNumber(x.weightPct),currency:x.currency?String(x.currency).toUpperCase().slice(0,3):null,amount:optionalNumber(x.amount),rationale:String(x.rationale||''),human_approved:!!x.humanApproved,client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.createdAt||new Date().toISOString()};
}
function allocationFromCloud(r){return{id:r.client_allocation_id,businessId:r.business_client_id||'',productId:r.product_client_id||'',allocationType:r.allocation_type,status:r.status,weightPct:r.weight_pct==null?'':String(r.weight_pct),currency:r.currency||'',amount:r.amount==null?'':String(r.amount),rationale:r.rationale||'',humanApproved:!!r.human_approved,createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at}}
async function syncAllocationBrain(){
  state.allocCloud.state='SYNCING';renderAllocCloudState();
  if(!await verifyCloudSession()){state.allocCloud.state='LOCAL_ONLY';renderAllocCloudState();return}
  try{
    const rows=(await restRows('command_resource_allocations')).map(allocationFromCloud),map=new Map(state.allocations.map(x=>[x.id,x]));
    for(const x of rows){const local=map.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))map.set(x.id,x)}
    state.allocations=[...map.values()];saveAllocations();
    await upsertOrgRows('command_resource_allocations','user_id,client_allocation_id',state.allocations.map(allocationToCloud));
    state.allocCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderAll();renderAllocCloudState();
  }catch(error){state.allocCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.allocCloud.lastSync};renderAllocCloudState();renderAll()}
}
async function syncAllocationItem(item){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{await upsertOrgRows('command_resource_allocations','user_id,client_allocation_id',[allocationToCloud(item)]);state.allocCloud.state='CLOUD_SYNCED';state.allocCloud.lastSync=new Date().toISOString();renderAllocCloudState()}
  catch(error){state.allocCloud.state='CLOUD_ERROR';state.allocCloud.lastError=String(error);renderAllocCloudState()}
}
async function deleteAllocationCloud(id){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{
    const response=await fetch(SUPABASE+'/rest/v1/command_resource_allocations?client_allocation_id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Prefer:'return=minimal'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('allocation_delete_failed');
  }catch(error){state.allocCloud.state='CLOUD_ERROR';state.allocCloud.lastError=String(error);renderAllocCloudState()}
}
function recommendedAttention(){
  const units=state.biz.units.filter(x=>x.status==='ACTIVE'),scored=units.map(x=>({unit:x,score:Math.max(1,businessScore(x))})),sum=scored.reduce((s,x)=>s+x.score,0);
  return scored.sort((a,b)=>b.score-a.score).map(x=>({unit:x.unit,weight:sum?x.score/sum*100:0,score:x.score}));
}
function renderAllocationBrain(){
  const proposed=state.allocations.filter(x=>x.status==='PROPOSED'),approved=state.allocations.filter(x=>x.humanApproved),active=state.allocations.filter(x=>x.status==='ACTIVE'),money=state.allocations.filter(x=>x.status==='PROPOSED'&&optionalNumber(x.amount)!==null);
  set('alloc-proposed-kpi',String(proposed.length));set('alloc-approved-kpi',String(approved.length));set('alloc-active-kpi',String(active.length));set('alloc-money-kpi',String(money.length));
  const reco=byId('allocation-recommendations');if(reco){const rows=recommendedAttention();reco.innerHTML=rows.length?rows.map(x=>'<div class="route-item">'+esc(x.unit.name)+'<small>'+x.weight.toFixed(1)+'% suggested attention · business score '+x.score+'/100</small></div>').join(''):'<div class="empty">Add active business units to generate evidence-based attention recommendations.</div>'}
  const g=governedPermission();set('allocation-governance','Planning authority only. Current sovereign market permission: '+g.action+' / '+g.capital+'. Human approval is required before any resource plan can become ACTIVE. Monetary amounts are records, not payments or capital release.');
  const businessOptions='<option value="">UNLINKED</option>'+state.biz.units.filter(x=>x.status!=='ARCHIVED').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  const productOptions='<option value="">UNLINKED</option>'+state.biz.products.filter(x=>x.status!=='ARCHIVED').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  const bs=byId('allocation-business');if(bs){const v=bs.value;bs.innerHTML=businessOptions;if([...bs.options].some(o=>o.value===v))bs.value=v}
  const ps=byId('allocation-product');if(ps){const v=ps.value;ps.innerHTML=productOptions;if([...ps.options].some(o=>o.value===v))ps.value=v}
  const host=byId('allocation-list');if(host){
    const rows=state.allocations.slice().sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
    host.innerHTML=rows.length?rows.map(x=>{const b=linkedBusiness(x.businessId),p=linkedProduct(x.productId),amount=optionalNumber(x.amount);return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.allocationType)+' · '+(p?esc(p.name):b?esc(b.name):'UNLINKED')+'</div><div class="org-meta">'+esc(x.status)+' · human approved '+(x.humanApproved?'YES':'NO')+(x.weightPct!==''?' · weight '+esc(x.weightPct)+'%':'')+(amount!==null?' · '+esc(x.currency||'USD')+' '+esc(amount.toLocaleString()):'')+'</div></div><div class="org-score">'+(x.humanApproved?'✓':'?')+'</div></div><div class="org-meta">'+esc(x.rationale||'No rationale recorded.')+'</div><div class="org-actions">'+(!x.humanApproved?'<button class="cmd-btn mini" data-alloc-approve="'+esc(x.id)+'">HUMAN APPROVE</button>':'')+(x.humanApproved&&x.status!=='ACTIVE'?'<button class="cmd-btn mini" data-alloc-status="'+esc(x.id)+'" data-status="ACTIVE">ACTIVATE PLAN</button>':'')+(x.status==='ACTIVE'?'<button class="cmd-btn mini" data-alloc-status="'+esc(x.id)+'" data-status="PAUSED">PAUSE</button>':'')+'<button class="cmd-btn mini" data-alloc-status="'+esc(x.id)+'" data-status="CLOSED">CLOSE</button><button class="cmd-btn mini danger" data-alloc-status="'+esc(x.id)+'" data-status="REJECTED">REJECT</button><button class="cmd-btn mini danger" data-alloc-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No resource proposals yet. Recommendations above remain advisory until you create a proposal.</div>';
  }
  document.querySelectorAll('[data-alloc-approve]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.allocations.find(v=>v.id===btn.dataset.allocApprove);if(!x)return;x.humanApproved=true;x.status='APPROVED';x.updatedAt=new Date().toISOString();saveAllocations();renderAll();void syncAllocationItem(x)}));
  document.querySelectorAll('[data-alloc-status]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.allocations.find(v=>v.id===btn.dataset.allocStatus);if(!x)return;if(btn.dataset.status==='ACTIVE'&&!x.humanApproved){alert('Human approval is required before this plan can become ACTIVE.');return}x.status=btn.dataset.status;x.updatedAt=new Date().toISOString();saveAllocations();renderAll();void syncAllocationItem(x)}));
  document.querySelectorAll('[data-alloc-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.allocDelete;state.allocations=state.allocations.filter(x=>x.id!==id);saveAllocations();renderAll();void deleteAllocationCloud(id)}));
}
function setupAllocationBrain(){
  byId('allocation-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries()),now=new Date().toISOString();row.currency=row.currency?String(row.currency).toUpperCase():'';const item={...row,id:uid(),status:'PROPOSED',humanApproved:false,createdAt:now,updatedAt:now};state.allocations.push(item);saveAllocations();e.currentTarget.reset();const c=e.currentTarget.querySelector('[name=currency]');if(c)c.value='USD';renderAll();void syncAllocationItem(item)});
}


function renderOutcomeCloudState(){
  const badge=byId('outcome-cloud-state');if(!badge)return;
  const mode=state.outcomeCloud.state,cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  badge.className='cmd-badge '+cls;badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':'LOCAL FALLBACK';
}
function outcomeToCloud(x){
  return{
    user_id:state.cloud.userId,client_outcome_id:x.id,entity_type:x.entityType,entity_client_id:x.entityId,
    title:String(x.title||'').slice(0,240),status:x.status||'PLANNED',metric_name:String(x.metricName||''),
    direction:x.direction||'HIGHER_IS_BETTER',baseline_value:optionalNumber(x.baselineValue),expected_value:num(x.expectedValue),
    actual_value:optionalNumber(x.actualValue),unit:String(x.unit||''),confidence:Math.max(0,Math.min(100,Math.round(num(x.confidence)||0))),
    currency:x.currency?String(x.currency).toUpperCase().slice(0,3):null,revenue:optionalNumber(x.revenue),
    cost:optionalNumber(x.cost),quantity:optionalNumber(x.quantity),lesson:String(x.lesson||''),next_action:String(x.nextAction||''),
    started_at:x.startedAt||null,due_at:x.dueAt||null,resolved_at:x.resolvedAt||null,
    client_created_at:x.createdAt||new Date().toISOString(),updated_at:x.updatedAt||x.resolvedAt||x.createdAt||new Date().toISOString()
  };
}
function outcomeFromCloud(r){
  return{id:r.client_outcome_id,entityType:r.entity_type,entityId:r.entity_client_id,title:r.title,status:r.status,metricName:r.metric_name,
    direction:r.direction,baselineValue:r.baseline_value==null?'':String(r.baseline_value),expectedValue:String(r.expected_value),
    actualValue:r.actual_value==null?'':String(r.actual_value),unit:r.unit||'',confidence:String(r.confidence),currency:r.currency||'',
    revenue:r.revenue==null?'':String(r.revenue),cost:r.cost==null?'':String(r.cost),quantity:r.quantity==null?'':String(r.quantity),
    lesson:r.lesson||'',nextAction:r.next_action||'',startedAt:r.started_at||null,dueAt:r.due_at||null,resolvedAt:r.resolved_at||null,
    createdAt:r.client_created_at||r.created_at,updatedAt:r.updated_at||r.created_at};
}
async function syncOutcomeBrain(){
  state.outcomeCloud.state='SYNCING';renderOutcomeCloudState();
  if(!await verifyCloudSession()){state.outcomeCloud.state='LOCAL_ONLY';renderOutcomeCloudState();return}
  try{
    const remote=(await restRows('command_outcomes')).map(outcomeFromCloud),map=new Map(state.outcomes.map(x=>[x.id,x]));
    for(const x of remote){const local=map.get(x.id);if(!local||cloudTimestamp(x)>=cloudTimestamp(local))map.set(x.id,x)}
    state.outcomes=[...map.values()];saveOutcomes();
    await upsertOrgRows('command_outcomes','user_id,client_outcome_id',state.outcomes.map(outcomeToCloud));
    state.outcomeCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderAll();renderOutcomeCloudState();
  }catch(error){state.outcomeCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.outcomeCloud.lastSync};renderOutcomeCloudState();renderAll()}
}
async function syncOutcomeItem(item){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{await upsertOrgRows('command_outcomes','user_id,client_outcome_id',[outcomeToCloud(item)]);state.outcomeCloud.state='CLOUD_SYNCED';state.outcomeCloud.lastSync=new Date().toISOString();renderOutcomeCloudState()}
  catch(error){state.outcomeCloud.state='CLOUD_ERROR';state.outcomeCloud.lastError=String(error);renderOutcomeCloudState()}
}
async function deleteOutcomeCloud(id){
  if(!state.cloud.token||!state.cloud.userId)return;
  try{
    const response=await fetch(SUPABASE+'/rest/v1/command_outcomes?client_outcome_id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Prefer:'return=minimal'},cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('outcome_delete_failed');
  }catch(error){state.outcomeCloud.state='CLOUD_ERROR';state.outcomeCloud.lastError=String(error);renderOutcomeCloudState()}
}
function outcomeDenominator(x){const e=Math.abs(num(x.expectedValue)),b=Math.abs(num(x.baselineValue));return Math.max(e,b,1e-9)}
function expectationAccuracy(x){
  if(x.status!=='RESOLVED'||optionalNumber(x.actualValue)===null)return null;
  const err=Math.abs(num(x.actualValue)-num(x.expectedValue))/outcomeDenominator(x);
  return clamp((1-err)*100,0,100);
}
function outcomePerformance(x){
  if(x.status!=='RESOLVED'||optionalNumber(x.actualValue)===null)return null;
  const expected=num(x.expectedValue),actual=num(x.actualValue),den=outcomeDenominator(x);
  if(x.direction==='LOWER_IS_BETTER'){
    if(actual<=expected)return 100;
    return clamp((Math.abs(expected)||den)/(Math.abs(actual)||den)*100,0,100);
  }
  if(x.direction==='TARGET')return expectationAccuracy(x);
  if(actual>=expected)return 100;
  return clamp((actual/den)*100,0,100);
}
function outcomeFeedback(type,id){
  const rows=state.outcomes.filter(x=>x.entityType===type&&x.entityId===id&&x.status==='RESOLVED').map(outcomePerformance).filter(x=>x!==null);
  return rows.length?rows.reduce((a,b)=>a+b,0)/rows.length:null;
}
function outcomeEntityLabel(x){
  if(x.entityType==='PROJECT')return state.org.projects.find(v=>v.id===x.entityId)?.title||'Unknown project';
  if(x.entityType==='BUSINESS')return linkedBusiness(x.entityId)?.name||'Unknown business';
  if(x.entityType==='PRODUCT')return linkedProduct(x.entityId)?.name||'Unknown product';
  if(x.entityType==='CHANNEL')return state.biz.channels.find(v=>v.id===x.entityId)?.name||'Unknown channel';
  if(x.entityType==='ALLOCATION'){
    const a=state.allocations.find(v=>v.id===x.entityId);if(!a)return'Unknown allocation';
    return (linkedProduct(a.productId)?.name||linkedBusiness(a.businessId)?.name||a.allocationType)+' allocation';
  }
  return'Unknown entity';
}
function outcomeEntities(type){
  if(type==='PROJECT')return state.org.projects.map(x=>({id:x.id,label:x.title}));
  if(type==='BUSINESS')return state.biz.units.map(x=>({id:x.id,label:x.name}));
  if(type==='PRODUCT')return state.biz.products.map(x=>({id:x.id,label:x.name}));
  if(type==='CHANNEL')return state.biz.channels.map(x=>({id:x.id,label:x.name}));
  if(type==='ALLOCATION')return state.allocations.map(x=>({id:x.id,label:(linkedProduct(x.productId)?.name||linkedBusiness(x.businessId)?.name||x.allocationType)+' · '+x.allocationType}));
  return[];
}
function refreshOutcomeEntitySelect(){
  const type=byId('outcome-entity-type')?.value||'PROJECT',select=byId('outcome-entity');if(!select)return;
  const current=select.value,rows=outcomeEntities(type);select.innerHTML='<option value="">SELECT ENTITY</option>'+rows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
  if(rows.some(x=>x.id===current))select.value=current;
}
function outcomeMetrics(){
  const resolved=state.outcomes.filter(x=>x.status==='RESOLVED'),running=state.outcomes.filter(x=>x.status==='RUNNING');
  const accuracy=resolved.map(expectationAccuracy).filter(x=>x!==null),performance=resolved.map(outcomePerformance).filter(x=>x!==null);
  const roiRows=resolved.map(x=>{const rev=optionalNumber(x.revenue),cost=optionalNumber(x.cost);return rev!==null&&cost!==null&&cost>0?(rev-cost)/cost*100:null}).filter(x=>x!==null);
  return{resolved,running,accuracy:accuracy.length?accuracy.reduce((a,b)=>a+b,0)/accuracy.length:null,performance:performance.length?performance.reduce((a,b)=>a+b,0)/performance.length:null,roi:roiRows.length?roiRows.reduce((a,b)=>a+b,0)/roiRows.length:null};
}
function renderOutcomeBrain(){
  const m=outcomeMetrics();set('outcome-running-kpi',String(m.running.length));set('outcome-resolved-kpi',String(m.resolved.length));set('outcome-accuracy-kpi',m.accuracy==null?'—':m.accuracy.toFixed(0)+'%');set('outcome-roi-kpi',m.roi==null?'—':m.roi.toFixed(1)+'%');
  let brief=m.resolved.length?'Resolved evidence now influences project, product, business and channel priority scores. Average performance score '+(m.performance==null?'—':m.performance.toFixed(0)+'/100')+'; expectation accuracy '+(m.accuracy==null?'—':m.accuracy.toFixed(0)+'%')+'. ':'No resolved outcomes yet. Priority scores still rely on declared impact, confidence, economics and blockers. ';
  const overdue=state.outcomes.filter(x=>['PLANNED','RUNNING'].includes(x.status)&&x.dueAt&&new Date(x.dueAt).getTime()<Date.now());
  if(overdue.length)brief+=overdue.length+' measurement'+(overdue.length===1?' is':'s are')+' overdue. ';
  brief+='Outcome feedback can move ranking modestly, but cannot override governance or capital permission.';
  set('outcome-brief',brief);

  const economics=m.resolved.filter(x=>optionalNumber(x.revenue)!==null||optionalNumber(x.cost)!==null||optionalNumber(x.quantity)!==null);
  set('unit-economics',economics.length?economics.slice(0,5).map(x=>{const rev=optionalNumber(x.revenue),cost=optionalNumber(x.cost),q=optionalNumber(x.quantity),roi=rev!==null&&cost!==null&&cost>0?(rev-cost)/cost*100:null;let s=outcomeEntityLabel(x)+': ';if(roi!==null)s+='ROI '+roi.toFixed(1)+'%. ';if(q!==null&&q>0&&rev!==null)s+='Revenue/unit '+(rev/q).toFixed(2)+' '+(x.currency||'')+'. ';if(q!==null&&q>0&&cost!==null)s+='Cost/unit '+(cost/q).toFixed(2)+' '+(x.currency||'')+'.';return s}).join(' '):'No resolved unit-economics observations yet. Revenue, cost and quantity remain optional evidence fields.');

  refreshOutcomeEntitySelect();

  const host=byId('outcome-list');if(host){
    const rows=state.outcomes.slice().sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)));
    host.innerHTML=rows.length?rows.map(x=>{const perf=outcomePerformance(x),acc=expectationAccuracy(x),actual=optionalNumber(x.actualValue);return '<article class="org-item"><div class="org-item-top"><div><div class="org-title">'+esc(x.title)+'</div><div class="org-meta">'+esc(x.entityType)+' · '+esc(outcomeEntityLabel(x))+' · '+esc(x.status)+'</div></div><div class="org-score">'+(perf==null?'?':Math.round(perf))+'</div></div><div class="org-meta">'+esc(x.metricName)+' · expected '+esc(x.expectedValue)+' '+esc(x.unit||'')+' · actual '+(actual===null?'—':esc(x.actualValue))+' '+esc(x.unit||'')+(acc==null?'':' · expectation accuracy '+acc.toFixed(0)+'%')+' · confidence '+esc(x.confidence)+'%'+(x.dueAt?' · due '+esc(new Date(x.dueAt).toLocaleString()):'')+'</div><div class="org-actions">'+(x.status==='PLANNED'?'<button class="cmd-btn mini" data-outcome-start="'+esc(x.id)+'">START</button>':'')+(!['RESOLVED','CANCELLED'].includes(x.status)?'<button class="cmd-btn mini" data-outcome-resolve="'+esc(x.id)+'">RESOLVE</button><button class="cmd-btn mini danger" data-outcome-cancel="'+esc(x.id)+'">CANCEL</button>':'')+'<button class="cmd-btn mini danger" data-outcome-delete="'+esc(x.id)+'">DELETE</button></div></article>'}).join(''):'<div class="empty">No outcomes frozen yet. Attach an expected result to a project, product, business, channel or allocation before reality arrives.</div>';
  }

  const learning=byId('learning-feed');if(learning){
    const rows=m.resolved.slice().sort((a,b)=>String(b.resolvedAt).localeCompare(String(a.resolvedAt)));
    learning.innerHTML=rows.length?rows.slice(0,10).map(x=>'<article class="org-item"><div class="org-title">'+esc(outcomeEntityLabel(x))+'</div><div class="org-meta">'+esc(x.metricName)+' · performance '+Math.round(outcomePerformance(x))+'/100 · accuracy '+Math.round(expectationAccuracy(x))+'%</div><div class="compression-copy">'+esc(x.lesson||((outcomePerformance(x)>=70?'Evidence supports the current thesis.':'Evidence weakens the current thesis. Review assumptions before allocating more resources.')))+'</div></article>').join(''):'<div class="empty">Learning feed activates when outcomes resolve.</div>';
  }

  document.querySelectorAll('[data-outcome-start]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.outcomes.find(v=>v.id===btn.dataset.outcomeStart);if(!x)return;x.status='RUNNING';x.startedAt=x.startedAt||new Date().toISOString();x.updatedAt=new Date().toISOString();saveOutcomes();renderAll();void syncOutcomeItem(x)}));
  document.querySelectorAll('[data-outcome-resolve]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.outcomes.find(v=>v.id===btn.dataset.outcomeResolve);if(!x)return;let actual=optionalNumber(x.actualValue);if(actual===null){const raw=prompt('Actual measured value for '+x.metricName+':');if(raw===null||raw.trim()===''||!Number.isFinite(Number(raw)))return;actual=Number(raw);x.actualValue=String(actual)}const lesson=prompt('What did this outcome teach the system?')||x.lesson||'';x.lesson=lesson.trim();x.status='RESOLVED';x.resolvedAt=new Date().toISOString();x.updatedAt=x.resolvedAt;saveOutcomes();renderAll();void syncOutcomeItem(x)}));
  document.querySelectorAll('[data-outcome-cancel]').forEach(btn=>btn.addEventListener('click',()=>{const x=state.outcomes.find(v=>v.id===btn.dataset.outcomeCancel);if(!x)return;x.status='CANCELLED';x.updatedAt=new Date().toISOString();saveOutcomes();renderAll();void syncOutcomeItem(x)}));
  document.querySelectorAll('[data-outcome-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.outcomeDelete;state.outcomes=state.outcomes.filter(x=>x.id!==id);saveOutcomes();renderAll();void deleteOutcomeCloud(id)}));
}
function setupOutcomeBrain(){
  byId('outcome-entity-type')?.addEventListener('change',refreshOutcomeEntitySelect);
  byId('sync-outcomes')?.addEventListener('click',()=>void syncOutcomeBrain());
  byId('outcome-form')?.addEventListener('submit',e=>{e.preventDefault();const row=Object.fromEntries(new FormData(e.currentTarget).entries());if(!row.entityId)return;const now=new Date().toISOString();row.currency=row.currency?String(row.currency).toUpperCase():'';row.dueAt=row.dueAt?new Date(row.dueAt).toISOString():null;const item={...row,id:uid(),status:'PLANNED',lesson:'',startedAt:null,resolvedAt:null,createdAt:now,updatedAt:now};state.outcomes.push(item);saveOutcomes();e.currentTarget.reset();const c=e.currentTarget.querySelector('[name=confidence]');if(c)c.value='60';renderAll();void syncOutcomeItem(item)});
}


function localDateKey(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
function simpleHash(input){
  let h=2166136261;
  for(let i=0;i<input.length;i++){h^=input.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16).toUpperCase().padStart(8,'0');
}
function renderCycleCloudState(){
  const badge=byId('cycle-cloud-state');if(!badge)return;
  const mode=state.cycleCloud.state,cls=mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='LOCAL_ONLY'?'warn':'bad';
  badge.className='cmd-badge '+cls;
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':'LOCAL FALLBACK';
}
function executiveSnapshot(){
  const sourceState={};
  for(const def of SOURCE_DEFS){
    const r=state.sources[def.key];
    sourceState[def.key]={ok:!!r?.ok,state:r?.ok?textState(r.data,'RESPONDING'):'OFFLINE',status:r?.status||0};
  }
  return{
    sources:sourceState,
    decisions:state.ledger.map(x=>[x.id,x.status,x.outcome,x.confidence,x.updatedAt||x.createdAt]),
    objectives:state.org.objectives.map(x=>[x.id,x.status,x.priority,x.currentValue,x.updatedAt||x.createdAt]),
    projects:state.org.projects.map(x=>[x.id,x.status,x.impact,x.effort,x.confidence,x.allocationWeight,x.blocker,x.updatedAt||x.createdAt]),
    businesses:state.biz.units.map(x=>[x.id,x.status,x.strategicPriority,x.revenue30d,x.cost30d,x.growthPct,x.blocker,x.updatedAt||x.createdAt]),
    products:state.biz.products.map(x=>[x.id,x.status,x.strategicPriority,x.revenue30d,x.conversionPct,x.marginPct,x.blocker,x.updatedAt||x.createdAt]),
    channels:state.biz.channels.map(x=>[x.id,x.status,x.leads30d,x.conversions30d,x.revenue30d,x.cost30d,x.updatedAt||x.createdAt]),
    allocations:state.allocations.map(x=>[x.id,x.status,x.humanApproved,x.allocationType,x.weightPct,x.amount,x.updatedAt||x.createdAt]),
    outcomes:state.outcomes.map(x=>[x.id,x.status,x.expectedValue,x.actualValue,x.dueAt,x.resolvedAt,x.updatedAt||x.createdAt])
  };
}
function detectExecutiveAnomalies(){
  const rows=[],push=(severity,code,title,copy,action,type='OPERATING')=>rows.push({severity,code,title,copy,action,type});
  const g=governedPermission(),healthy=SOURCE_DEFS.filter(d=>state.sources[d.key]?.ok&&severityFromText(textState(state.sources[d.key]?.data))==='good').length,healthPct=Math.round(healthy/SOURCE_DEFS.length*100);
  if(!state.sources.closure?.ok)push(100,'SOVEREIGN_GATE_OFFLINE','Sovereign gate unavailable','Production closure cannot be read. Capital-bearing decisions remain WAIT / 0R.','Restore production closure visibility before any execution promotion.','GOVERNANCE');
  for(const def of SOURCE_DEFS.filter(x=>x.critical&&x.key!=='closure'))if(!state.sources[def.key]?.ok)push(92,'CRITICAL_SOURCE_'+def.key.toUpperCase(),def.name+' unavailable','A critical command source is offline or unreadable.','Restore '+def.name+' observability and preserve fail-closed behavior.','SYSTEM');
  if(healthPct<50)push(88,'LOW_MACHINE_HEALTH','Machine health below 50%','Only '+healthy+' of '+SOURCE_DEFS.length+' sources are healthy by command-state classification.','Repair observability before expanding autonomy.','SYSTEM');
  const blocked=state.org.projects.filter(x=>x.status==='BLOCKED'||String(x.blocker||'').trim()).sort((a,b)=>projectScore(b)-projectScore(a));
  blocked.slice(0,3).forEach((x,i)=>push(82-i,'PROJECT_BLOCKED_'+x.id,x.title,'Blocked project with priority score '+projectScore(x)+'/100. '+(x.blocker||'Constraint unspecified.'),'Remove or explicitly accept the blocker before assigning more work.','ORGANIZATION'));
  const overdue=state.outcomes.filter(x=>['PLANNED','RUNNING'].includes(x.status)&&x.dueAt&&new Date(x.dueAt).getTime()<Date.now());
  overdue.slice(0,3).forEach((x,i)=>push(84-i,'OUTCOME_OVERDUE_'+x.id,x.title,'Measurement deadline passed without a resolved actual value.','Record the actual outcome or cancel the experiment so learning does not stall.','LEARNING'));
  const activeProjects=state.org.projects.filter(x=>['ACTIVE','PLANNED','BLOCKED'].includes(x.status)),weights=activeProjects.reduce((s,x)=>s+num(x.allocationWeight),0);
  if(weights>100)push(79,'ATTENTION_OVERCOMMITTED','Project attention exceeds 100%','Declared project attention totals '+weights+'%.','Reduce active attention weights until the portfolio fits inside 100%.','ORGANIZATION');
  const monetary=state.allocations.filter(x=>x.status==='PROPOSED'&&!x.humanApproved&&optionalNumber(x.amount)!==null);
  if(monetary.length)push(76,'MONEY_PROPOSALS_PENDING',monetary.length+' monetary proposal'+(monetary.length===1?' awaits':'s await')+' review','Money proposals remain planning records until human approval.','Approve, reject or defer each proposal. No funds move automatically.','HUMAN');
  for(const x of state.biz.units.filter(x=>x.status==='ACTIVE')){
    const rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d),growth=optionalNumber(x.growthPct);
    if(rev!==null&&cost!==null&&cost>rev)push(69,'NEGATIVE_UNIT_MARGIN_'+x.id,x.name+' is spending above 30D revenue','Recorded cost exceeds recorded revenue in '+esc(x.currency||'USD')+'.','Inspect cost structure and verify the measurement window before increasing resources.','BUSINESS');
    if(growth!==null&&growth<0)push(63,'NEGATIVE_GROWTH_'+x.id,x.name+' growth is negative','Recorded 30-day growth is '+growth+'%.','Diagnose retention, conversion and distribution before adding acquisition spend.','BUSINESS');
  }
  for(const x of state.biz.channels.filter(x=>x.status==='ACTIVE')){
    const rev=optionalNumber(x.revenue30d),cost=optionalNumber(x.cost30d);
    if(rev!==null&&cost!==null&&cost>0&&rev<cost)push(61,'CHANNEL_NEGATIVE_ROI_'+x.id,x.name+' has negative observed channel ROI','30-day revenue is below recorded channel cost.','Review attribution and pause scaling until economics improve.','DISTRIBUTION');
  }
  const stale=state.ledger.filter(x=>x.status==='OPEN'&&Date.now()-new Date(x.createdAt).getTime()>7*864e5);
  if(stale.length)push(56,'STALE_DECISIONS',stale.length+' open decision'+(stale.length===1?' is':'s are')+' older than 7 days','Old unresolved decisions create hidden cognitive inventory.','Resolve, defer or delete stale decisions.','DECISION');
  if(activeProjects.length>0&&!state.outcomes.some(x=>['PLANNED','RUNNING'].includes(x.status)))push(58,'MEASUREMENT_DEBT','Active work has no running measurement loop','Projects are moving without a frozen expected outcome.','Attach at least one measurable outcome to the highest-priority active work.','LEARNING');
  if(g.action!=='WAIT'||g.capital!=='0R')push(70,'PERMISSION_CHANGED','Sovereign permission is no longer baseline WAIT / 0R','Current authority reads '+g.action+' / '+g.capital+'.','Require human review of the upstream evidence before treating any permission change as actionable.','GOVERNANCE');
  return rows.sort((a,b)=>b.severity-a.severity);
}
function executiveHumanDecisions(){
  const rows=[];
  const q=state.sources.q4?.data;
  if(q?.watch?.candidate_ready===true)rows.push({priority:95,title:'Review governed market candidate',copy:'Candidate readiness is reviewable, but review does not grant exposure.'});
  state.allocations.filter(x=>x.status==='PROPOSED'&&!x.humanApproved).slice(0,3).forEach(x=>{const target=linkedProduct(x.productId)?.name||linkedBusiness(x.businessId)?.name||x.allocationType;rows.push({priority:optionalNumber(x.amount)!==null?90:72,title:'Approve / reject '+target+' resource proposal',copy:x.rationale||'Human approval is required before activation.'})});
  state.biz.units.filter(x=>x.status==='EXIT_REVIEW').forEach(x=>rows.push({priority:85,title:'Decide whether to exit '+x.name,copy:'Business unit is explicitly in EXIT REVIEW.'}));
  state.biz.products.filter(x=>x.status==='KILL_REVIEW').forEach(x=>rows.push({priority:82,title:'Decide whether to kill '+x.name,copy:'Product is explicitly in KILL REVIEW.'}));
  const blocked=state.org.projects.filter(x=>(x.status==='BLOCKED'||x.blocker)&&projectScore(x)>=70).sort((a,b)=>projectScore(b)-projectScore(a))[0];
  if(blocked)rows.push({priority:78,title:'Resolve founder-level blocker: '+blocked.title,copy:blocked.blocker||'High-priority work is blocked.'});
  return rows.sort((a,b)=>b.priority-a.priority).slice(0,5);
}
function executiveReallocation(){
  const rows=recommendedAttention().slice(0,5).map(x=>({target:x.unit.name,weight:Number(x.weight.toFixed(1)),score:x.score,copy:'Suggested attention share based on current business score and resolved outcome evidence. Advisory only.'}));
  const weak=state.biz.units.filter(x=>x.status==='ACTIVE'&&outcomeFeedback('BUSINESS',x.id)!==null&&outcomeFeedback('BUSINESS',x.id)<45).sort((a,b)=>outcomeFeedback('BUSINESS',a.id)-outcomeFeedback('BUSINESS',b.id));
  weak.slice(0,2).forEach(x=>rows.push({target:x.name,weight:null,score:businessScore(x),copy:'Resolved outcome evidence is weak. Consider reducing incremental attention until assumptions are reviewed.'}));
  return rows.slice(0,6);
}
function buildExecutiveCycle(){
  const date=localDateKey(),snapshot=executiveSnapshot(),g=governedPermission(),m=organizationMetrics();
  const healthy=SOURCE_DEFS.filter(d=>state.sources[d.key]?.ok&&severityFromText(textState(state.sources[d.key]?.data))==='good').length,healthPct=Math.round(healthy/SOURCE_DEFS.length*100);
  const anomalies=detectExecutiveAnomalies(),interventions=anomalies.slice(0,3).map(x=>({priority:x.severity,title:x.action,reason:x.title,type:x.type})),reallocation=executiveReallocation(),human=executiveHumanDecisions();
  if(!interventions.length){
    const top=buildQueue()[0];
    if(top)interventions.push({priority:top.score,title:top.title,reason:top.copy,type:top.type});
    else interventions.push({priority:20,title:'Preserve focus and continue observation',reason:'No anomaly currently earns intervention. Silence is a valid machine output.',type:'STEWARD'});
  }
  const semanticState={
    governance:[g.action,g.capital],
    machineHealthPct:healthPct,
    focusScore:m.focus,
    anomalies:anomalies.map(x=>[x.code,x.severity]),
    interventions:interventions.map(x=>[x.type,x.title]),
    humanDecisions:human.map(x=>[x.priority,x.title]),
    reallocation:reallocation.map(x=>[x.target,x.weight,x.score]),
    candidateReady:state.sources.q4?.data?.watch?.candidate_ready===true
  };
  const fingerprint='CYC-'+date+'-'+simpleHash(JSON.stringify(semanticState));
  const summary='Executive cycle '+date+': '+anomalies.length+' anomal'+(anomalies.length===1?'y':'ies')+', '+human.length+' human decision'+(human.length===1?'':'s')+', machine health '+healthPct+'%, organization focus '+m.focus+'%. Sovereign authority remains '+g.action+' / '+g.capital+'. '+(interventions[0]?'Top intervention: '+interventions[0].title+'.':'');
  return{cycleDate:date,version:'V173',stateFingerprint:fingerprint,sovereignAction:g.action,capitalPermission:g.capital,machineHealthPct:healthPct,focusScore:m.focus,summary,anomalies,interventions:interventions.slice(0,3),reallocationSuggestions:reallocation,humanDecisions:human,sourceSnapshot:snapshot};
}
function cycleToCloud(x){
  return{user_id:state.cloud.userId,cycle_date:x.cycleDate,version:x.version,state_fingerprint:x.stateFingerprint,sovereign_action:x.sovereignAction,capital_permission:x.capitalPermission,machine_health_pct:x.machineHealthPct,focus_score:x.focusScore,summary:x.summary,anomalies:x.anomalies,interventions:x.interventions,reallocation_suggestions:x.reallocationSuggestions,human_decisions:x.humanDecisions,source_snapshot:x.sourceSnapshot,generation_count:x.generationCount,first_generated_at:x.firstGeneratedAt,generated_at:x.generatedAt,updated_at:x.generatedAt};
}
function cycleFromCloud(r){
  return{cycleDate:r.cycle_date,version:r.version,stateFingerprint:r.state_fingerprint,sovereignAction:r.sovereign_action,capitalPermission:r.capital_permission,machineHealthPct:r.machine_health_pct,focusScore:r.focus_score,summary:r.summary,anomalies:Array.isArray(r.anomalies)?r.anomalies:[],interventions:Array.isArray(r.interventions)?r.interventions:[],reallocationSuggestions:Array.isArray(r.reallocation_suggestions)?r.reallocation_suggestions:[],humanDecisions:Array.isArray(r.human_decisions)?r.human_decisions:[],sourceSnapshot:r.source_snapshot||{},generationCount:r.generation_count,firstGeneratedAt:r.first_generated_at,generatedAt:r.generated_at};
}
async function fetchTodayCycle(){
  if(!state.cloud.token)return null;
  const date=localDateKey(),response=await fetch(SUPABASE+'/rest/v1/command_executive_cycles?cycle_date=eq.'+encodeURIComponent(date)+'&select=*&limit=1',{headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'executive_cycle_read_failed');
  return Array.isArray(data)&&data[0]?cycleFromCloud(data[0]):null;
}
async function runExecutiveCycle(force=false){
  const draft=buildExecutiveCycle(),previous=state.executiveCycle&&state.executiveCycle.cycleDate===draft.cycleDate?state.executiveCycle:null;
  if(previous&&!force&&previous.stateFingerprint===draft.stateFingerprint){
    state.executiveCycle={...previous,...draft,generationCount:previous.generationCount||1,firstGeneratedAt:previous.firstGeneratedAt||previous.generatedAt||new Date().toISOString(),generatedAt:previous.generatedAt||new Date().toISOString()};
    saveExecutiveCycle();renderExecutiveCycle();
    if(!sessionToken()){state.cycleCloud.state='LOCAL_ONLY';renderCycleCloudState();return state.executiveCycle}
    state.cycleCloud.state='SYNCING';renderCycleCloudState();
    try{
      if(!await verifyCloudSession()){state.cycleCloud.state='LOCAL_ONLY';renderCycleCloudState();return state.executiveCycle}
      const remote=await fetchTodayCycle();
      if(remote&&remote.stateFingerprint===draft.stateFingerprint){
        state.executiveCycle={...state.executiveCycle,generationCount:Math.max(num(state.executiveCycle.generationCount),num(remote.generationCount)),firstGeneratedAt:remote.firstGeneratedAt||state.executiveCycle.firstGeneratedAt,generatedAt:remote.generatedAt||state.executiveCycle.generatedAt};
        saveExecutiveCycle();
      }else{
        await upsertOrgRows('command_executive_cycles','user_id,cycle_date',[cycleToCloud(state.executiveCycle)]);
      }
      state.cycleCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderExecutiveCycle();renderCycleCloudState();return state.executiveCycle;
    }catch(error){state.cycleCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.cycleCloud.lastSync};renderCycleCloudState();return state.executiveCycle}
  }
  const now=new Date().toISOString();
  const item={...draft,generationCount:previous?num(previous.generationCount)+1:1,firstGeneratedAt:previous?.firstGeneratedAt||now,generatedAt:now};
  state.executiveCycle=item;saveExecutiveCycle();renderExecutiveCycle();
  if(!await verifyCloudSession()){state.cycleCloud.state='LOCAL_ONLY';renderCycleCloudState();return item}
  state.cycleCloud.state='SYNCING';renderCycleCloudState();
  try{
    const remote=await fetchTodayCycle();
    if(remote&&remote.stateFingerprint===item.stateFingerprint){
      state.executiveCycle={...item,generationCount:Math.max(num(item.generationCount),num(remote.generationCount)),firstGeneratedAt:remote.firstGeneratedAt||item.firstGeneratedAt,generatedAt:remote.generatedAt||item.generatedAt};
      saveExecutiveCycle();state.cycleCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderExecutiveCycle();renderCycleCloudState();return state.executiveCycle;
    }
    if(remote){item.generationCount=Math.max(num(item.generationCount),num(remote.generationCount)+1);item.firstGeneratedAt=remote.firstGeneratedAt||item.firstGeneratedAt}
    await upsertOrgRows('command_executive_cycles','user_id,cycle_date',[cycleToCloud(item)]);
    state.executiveCycle=item;saveExecutiveCycle();state.cycleCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};renderExecutiveCycle();renderCycleCloudState();return item;
  }catch(error){state.cycleCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.cycleCloud.lastSync};renderCycleCloudState();return item}
}
function cycleListHtml(rows,empty,format){
  return rows?.length?rows.map(format).join(''):'<div class="route-item"><small>'+esc(empty)+'</small></div>';
}
function renderExecutiveCycle(){
  const x=state.executiveCycle;if(!x){set('cycle-summary','Executive cycle has not generated yet.');return}
  set('cycle-anomaly-kpi',String(x.anomalies?.length||0));set('cycle-intervention-kpi',String(x.interventions?.length||0));set('cycle-human-kpi',String(x.humanDecisions?.length||0));set('cycle-generation-kpi',String(x.generationCount||1));
  set('cycle-summary',x.summary);set('cycle-stamp','Generated '+new Date(x.generatedAt).toLocaleString()+' · '+x.cycleDate+' · '+x.version);set('cycle-fingerprint',x.stateFingerprint);
  const a=byId('cycle-anomalies');if(a)a.innerHTML=cycleListHtml(x.anomalies,'No meaningful anomaly detected.',r=>'<div class="route-item">'+esc(r.title)+'<small>'+esc(r.type)+' · severity '+esc(r.severity)+' · '+esc(r.copy)+'</small></div>');
  const i=byId('cycle-interventions');if(i)i.innerHTML=cycleListHtml(x.interventions,'No intervention required.',r=>'<div class="route-item">'+esc(r.title)+'<small>'+esc(r.type)+' · '+esc(r.reason)+'</small></div>');
  const rr=byId('cycle-reallocation');if(rr)rr.innerHTML=cycleListHtml(x.reallocationSuggestions,'No active business evidence supports a reallocation suggestion yet.',r=>'<div class="route-item">'+esc(r.target)+(r.weight!=null?' · '+esc(r.weight)+'%':'')+'<small>score '+esc(r.score)+' · '+esc(r.copy)+'</small></div>');
  const h=byId('cycle-human-decisions');if(h)h.innerHTML=cycleListHtml(x.humanDecisions,'Nothing currently requires founder-level judgment.',r=>'<div class="route-item">'+esc(r.title)+'<small>priority '+esc(r.priority)+' · '+esc(r.copy)+'</small></div>');
}
function setupExecutiveCycle(){
  byId('run-executive-cycle')?.addEventListener('click',()=>void runHeadlessExecutiveCycle());
}


function renderInterventionCloudState(){
  const badge=byId('intervention-cloud-state');if(!badge)return;
  const mode=state.interventionCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':state.kernelCloud.lastError==='V180_SECURITY_SEAL_PENDING'?'SEAL PENDING':'SIGN IN REQUIRED';
}
async function interventionRows(){
  const response=await fetch(SUPABASE+'/rest/v1/command_interventions?select=*&order=priority.desc,updated_at.desc',{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'intervention_read_failed');
  return Array.isArray(data)?data:[];
}
async function interventionEventRows(){
  const response=await fetch(SUPABASE+'/rest/v1/command_intervention_events?select=*&order=created_at.desc&limit=40',{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'intervention_event_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncInterventions(){
  state.interventionCloud.state='SYNCING';renderInterventionCloudState();
  if(!await verifyCloudSession()){state.interventionCloud.state='LOCAL_ONLY';renderInterventionCloudState();renderInterventions();return}
  try{
    const [items,events]=await Promise.all([interventionRows(),interventionEventRows()]);
    state.interventions=items;state.interventionEvents=events;
    state.interventionCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.interventionCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.interventionCloud.lastSync};
  }
  renderInterventionCloudState();renderInterventions();
}
function interventionNext(status){
  return{
    NEW:['ACKNOWLEDGED','DEFERRED'],
    ACKNOWLEDGED:['APPROVED','DEFERRED','RESOLVED'],
    APPROVED:['EXECUTING','DEFERRED','RESOLVED'],
    DEFERRED:['ACKNOWLEDGED','RESOLVED'],
    EXECUTING:['RESOLVED','DEFERRED'],
    RESOLVED:['LEARNED','NEW'],
    LEARNED:['NEW']
  }[status]||[];
}
function transitionLabel(status){
  return({ACKNOWLEDGED:'ACKNOWLEDGE',APPROVED:'APPROVE PLAN',DEFERRED:'DEFER',EXECUTING:'START WORK',RESOLVED:'RESOLVE',LEARNED:'CAPTURE LESSON',NEW:'REOPEN'})[status]||status;
}
async function transitionIntervention(id,toStatus){
  if(!await verifyCloudSession())return;
  const item=state.interventions.find(x=>x.id===id);if(!item)return;
  if(!interventionNext(item.status).includes(toStatus))return;
  let note='';
  if(toStatus==='RESOLVED'){
    const v=prompt('Resolution evidence / outcome:','');if(v===null)return;note=v.trim();
    if(!note){alert('Add resolution evidence before closing the intervention.');return}
  }else if(toStatus==='LEARNED'){
    const v=prompt('What did the system learn?','');if(v===null)return;note=v.trim();
    if(!note){alert('Capture a lesson before marking this learned.');return}
  }else if(toStatus==='DEFERRED'){
    const v=prompt('Why is this being deferred, or what condition should reopen it?','');if(v===null)return;note=v.trim();
  }else if(toStatus==='APPROVED'){
    const v=prompt('Approval note (optional). This approves the workflow plan only, not external capital or trading authority.','');if(v===null)return;note=v.trim();
  }else if(toStatus==='NEW'){
    const v=prompt('Reason for reopening (optional):','');if(v===null)return;note=v.trim();
  }
  state.interventionCloud.state='SYNCING';renderInterventionCloudState();
  try{
    const response=await fetch(SUPABASE+'/rest/v1/rpc/command_transition_intervention',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_intervention_id:id,p_to_status:toStatus,p_note:note}),
      cache:'no-store',signal:AbortSignal.timeout(10000)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||data?.hint||'intervention_transition_failed');
    await syncInterventions();
  }catch(error){
    state.interventionCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.interventionCloud.lastSync};
    renderInterventionCloudState();alert('Workflow transition failed. The prior state is unchanged.');
  }
}
function interventionFiltered(){
  const filter=byId('intervention-filter')?.value||'OPEN',items=state.interventions.slice();
  if(filter==='ALL')return items;
  if(filter==='HUMAN')return items.filter(x=>x.approval_required&&!['RESOLVED','LEARNED'].includes(x.status));
  if(filter==='CLEARED')return items.filter(x=>x.signal_active===false&&!['RESOLVED','LEARNED'].includes(x.status));
  if(filter==='CLOSED')return items.filter(x=>['RESOLVED','LEARNED'].includes(x.status));
  return items.filter(x=>!['RESOLVED','LEARNED'].includes(x.status));
}
function interventionClass(item){
  if(['RESOLVED','LEARNED'].includes(item.status))return'good';
  if(item.signal_active===false)return'warn';
  if(item.severity>=90)return'bad';
  if(item.approval_required||item.status==='NEW')return'warn';
  return'good';
}
function renderInterventions(){
  const items=state.interventions||[];
  set('inbox-new-kpi',String(items.filter(x=>x.status==='NEW').length));
  set('inbox-human-kpi',String(items.filter(x=>x.approval_required&&!['RESOLVED','LEARNED'].includes(x.status)).length));
  set('inbox-active-kpi',String(items.filter(x=>['APPROVED','EXECUTING'].includes(x.status)).length));
  set('inbox-closed-kpi',String(items.filter(x=>['RESOLVED','LEARNED'].includes(x.status)).length));
  const list=byId('intervention-list');
  if(list){
    const rows=interventionFiltered();
    list.innerHTML=rows.length?rows.map(x=>{
      const next=interventionNext(x.status),signal=x.signal_active?'SIGNAL ACTIVE':'SIGNAL CLEARED',cls=interventionClass(x);
      const buttons=next.map(s=>'<button class="cmd-btn'+(s==='APPROVED'?' primary':'')+'" data-intervention="'+esc(x.id)+'" data-next="'+esc(s)+'">'+esc(transitionLabel(s))+'</button>').join('');
      return '<article class="intervention-item'+(x.signal_active?'':' signal-off')+'"><div class="intervention-top"><div><div class="intervention-title">'+esc(x.title)+'</div><div class="intervention-meta">'+esc(x.category)+' · PRIORITY '+esc(x.priority)+' · OCCURRENCE '+esc(x.occurrence_count)+' · '+esc(signal)+'</div></div><span class="cmd-badge '+cls+'">'+esc(x.status)+'</span></div><div class="intervention-copy">'+esc(x.summary||'')+'</div><div class="intervention-action">'+esc(x.recommended_action||'Review and decide next action.')+'</div><div class="intervention-meta">SOURCE '+esc(x.source_code||x.source)+' · LAST SEEN '+esc(x.last_seen_at?new Date(x.last_seen_at).toLocaleString():'—')+(x.approval_required?' · HUMAN APPROVAL REQUIRED':'')+'</div><div class="intervention-actions">'+buttons+'</div></article>';
    }).join(''):'<div class="route-item"><small>No interventions match this filter.</small></div>';
    list.querySelectorAll('[data-intervention][data-next]').forEach(btn=>btn.addEventListener('click',()=>void transitionIntervention(btn.dataset.intervention,btn.dataset.next)));
  }
  const events=byId('intervention-events');
  if(events){
    const titleById=new Map(items.map(x=>[x.id,x.title]));
    events.innerHTML=state.interventionEvents.length?state.interventionEvents.slice(0,12).map(e=>'<div class="intervention-event"><strong>'+esc(e.event_type.replaceAll('_',' '))+'</strong>'+esc(titleById.get(e.intervention_id)||'Intervention')+'<br>'+esc((e.from_status||'—')+' → '+(e.to_status||'—'))+' · '+esc(e.actor)+' · '+esc(new Date(e.created_at).toLocaleString())+(e.note?'<br>'+esc(e.note):'')+'</div>').join(''):'<div class="intervention-event">No workflow events yet.</div>';
  }
}
function setupInterventions(){
  byId('sync-interventions')?.addEventListener('click',()=>void syncInterventions());
  byId('intervention-filter')?.addEventListener('change',renderInterventions);
}
async function runHeadlessExecutiveCycle(){
  const btn=byId('run-executive-cycle');
  if(btn){btn.disabled=true;btn.textContent='RUNNING V179'}
  try{
    await fetchJson('/api/executive-cycle',65000);
    await Promise.allSettled([syncMachine(),syncInterventions(),syncRunbooksConsole(),syncAgentWorkforceConsole(),syncPlannerConsole(),syncSchedulerConsole(),syncDispatchConsole()]);
    await runExecutiveCycle(true);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='RUN EXECUTIVE CYCLE'}
  }
}


function renderRunbookCloudState(){
  const badge=byId('runbook-cloud-state');if(!badge)return;
  const mode=state.runbookCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchRunbookTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'runbook_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncRunbooksConsole(){
  state.runbookCloud.state='SYNCING';renderRunbookCloudState();
  if(!await verifyCloudSession()){
    state.runbookCloud.state='LOCAL_ONLY';renderRunbookCloudState();renderRunbooks();return;
  }
  try{
    const [runbooks,steps,runs,events]=await Promise.all([
      fetchRunbookTable('command_runbooks?select=*&order=updated_at.desc'),
      fetchRunbookTable('command_runbook_steps?select=*&order=runbook_id.asc,position.asc'),
      fetchRunbookTable('command_action_runs?select=*&order=created_at.desc&limit=100'),
      fetchRunbookTable('command_action_events?select=*&order=created_at.desc&limit=80')
    ]);
    state.runbooks=runbooks;state.runbookSteps=steps;state.actionRuns=runs;state.actionEvents=events;
    state.runbookCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.runbookCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.runbookCloud.lastSync};
  }
  renderRunbookCloudState();renderRunbooks();
}
function capabilityClassName(value){
  return String(value||'').replaceAll('_',' ');
}
function runbookBadge(status){
  if(status==='COMPLETE')return'good';
  if(status==='BLOCKED'||status==='CANCELLED')return'bad';
  return'warn';
}
function stepBadge(step){
  if(step.status==='SUCCEEDED')return'good';
  if(step.status==='FAILED'||step.status==='BLOCKED'||step.capability_class==='FORBIDDEN')return step.capability_class==='FORBIDDEN'?'bad':'bad';
  return'warn';
}
async function approveRunbook(id){
  if(!await verifyCloudSession())return;
  const runbook=state.runbooks.find(x=>x.id===id);if(!runbook||runbook.status!=='READY'||!runbook.approval_required)return;
  const note=prompt('Approval note (optional). This approves only the bounded V175 internal runbook. It does not authorize trading, payments, fund movement, credentials, secrets or irreversible external action.','');
  if(note===null)return;
  state.runbookCloud.state='SYNCING';renderRunbookCloudState();
  try{
    const response=await fetch(SUPABASE+'/rest/v1/rpc/command_approve_runbook',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_runbook_id:id,p_note:note.trim()}),
      cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(data?.message||data?.hint||'runbook_approval_failed');
    await syncRunbooksConsole();
    await fetchJson('/api/executive-cycle',60000);
    await Promise.allSettled([syncRunbooksConsole(),syncInterventions(),syncAgentWorkforceConsole(),syncPlannerConsole()]);
  }catch(error){
    state.runbookCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.runbookCloud.lastSync};
    renderRunbookCloudState();alert('Runbook approval failed. No external action was performed.');
  }
}
function renderRunbooks(){
  const runbooks=state.runbooks||[],steps=state.runbookSteps||[],runs=state.actionRuns||[];
  set('runbook-kpi',String(runbooks.length));
  set('runbook-approval-kpi',String(runbooks.filter(x=>x.approval_required&&x.status==='READY').length));
  set('runbook-success-kpi',String(runs.filter(x=>x.status==='SUCCEEDED').length));
  set('runbook-blocked-kpi',String(runs.filter(x=>x.status==='BLOCKED'||x.capability_class==='FORBIDDEN').length));

  const list=byId('runbook-list');
  if(list){
    list.innerHTML=runbooks.length?runbooks.map(r=>{
      const child=steps.filter(s=>s.runbook_id===r.id).sort((a,b)=>num(a.position)-num(b.position));
      const approve=r.approval_required&&r.status==='READY'?'<button class="cmd-btn primary" data-approve-runbook="'+esc(r.id)+'">APPROVE BOUNDED PLAN</button>':'';
      const stepHtml=child.map(s=>'<div class="step-row"><div class="step-num">'+esc(String(s.position).padStart(2,'0'))+'</div><div><div class="step-title">'+esc(s.title)+'</div><div class="step-meta">'+esc(capabilityClassName(s.capability_class))+' · '+esc(s.action_kind.replaceAll('_',' '))+(s.requires_owner_approval?' · OWNER GATE':'')+'</div></div><span class="cmd-badge '+stepBadge(s)+'">'+esc(s.status)+'</span></div>').join('');
      return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(r.title)+'</div><div class="runbook-meta">VERSION '+esc(r.version)+' · CEILING '+esc(capabilityClassName(r.capability_ceiling))+' · '+(r.approval_required?'OWNER APPROVAL REQUIRED':'SAFE INTERNAL AUTO PATH')+'</div></div><span class="cmd-badge '+runbookBadge(r.status)+'">'+esc(r.status)+'</span></div><div class="intervention-action">'+esc(r.objective||'Resolve the intervention with evidence.')+'</div><div class="step-stack">'+stepHtml+'</div><div class="runbook-meta">FINGERPRINT '+esc(r.source_fingerprint||'—')+(r.approved_at?' · APPROVED '+esc(new Date(r.approved_at).toLocaleString()):'')+'</div><div class="intervention-actions">'+approve+'</div></article>';
    }).join(''):'<div class="route-item"><small>No runbooks yet. The next V175 cycle will compile them from open interventions.</small></div>';
    list.querySelectorAll('[data-approve-runbook]').forEach(btn=>btn.addEventListener('click',()=>void approveRunbook(btn.dataset.approveRunbook)));
  }

  const receipts=byId('action-receipts');
  if(receipts){
    const titleById=new Map(runbooks.map(r=>[r.id,r.title]));
    receipts.innerHTML=runs.length?runs.slice(0,18).map(a=>{
      const cls=a.status==='SUCCEEDED'?'good':'bad';
      const external=a.governance?.external_effects===true?'EXTERNAL EFFECT':'NO EXTERNAL EFFECT';
      return '<div class="action-receipt"><strong>'+esc(a.status)+' · '+esc(capabilityClassName(a.capability_class))+'</strong>'+esc(titleById.get(a.runbook_id)||'Runbook')+'<br>'+esc(a.action_kind.replaceAll('_',' '))+' · '+esc(a.mode)+'<br>'+esc(external)+' · '+esc(new Date(a.created_at).toLocaleString())+'</div>';
    }).join(''):'<div class="action-receipt">No action receipts yet.</div>';
  }
}
function setupRunbooks(){
  byId('sync-runbooks')?.addEventListener('click',()=>void syncRunbooksConsole());
}


function renderAgentCloudState(){
  const badge=byId('agent-cloud-state');if(!badge)return;
  const mode=state.agentCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchAgentTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'agent_workforce_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncAgentWorkforceConsole(){
  state.agentCloud.state='SYNCING';renderAgentCloudState();
  if(!await verifyCloudSession()){
    state.agentCloud.state='LOCAL_ONLY';renderAgentCloudState();renderAgents();return;
  }
  try{
    const [agents,assignments,events]=await Promise.all([
      fetchAgentTable('command_agents?select=*&order=agent_key.asc'),
      fetchAgentTable('command_agent_assignments?select=*&order=created_at.desc&limit=160'),
      fetchAgentTable('command_agent_events?select=*&order=created_at.desc&limit=100')
    ]);
    state.agents=agents;state.agentAssignments=assignments;state.agentEvents=events;
    state.agentCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.agentCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.agentCloud.lastSync};
  }
  renderAgentCloudState();renderAgents();
}
function agentStatusBadge(status){
  if(status==='ACTIVE'||status==='COMPLETE')return'good';
  if(status==='FAILED'||status==='BLOCKED'||status==='DEGRADED')return'bad';
  return'warn';
}
function renderAgents(){
  const agents=state.agents||[],assignments=state.agentAssignments||[];
  const forbiddenKinds=new Set(['TRADE_ORDER','PAYMENT','FUND_TRANSFER','CREDENTIAL_CHANGE','SECRET_ACCESS','EXTERNAL_IRREVERSIBLE','OWNER_APPROVAL']);
  set('agent-active-kpi',String(agents.filter(x=>x.status==='ACTIVE').length));
  set('agent-complete-kpi',String(assignments.filter(x=>x.status==='COMPLETE').length));
  set('agent-queued-kpi',String(assignments.filter(x=>x.status==='QUEUED'||x.status==='RUNNING').length));
  set('agent-forbidden-kpi',String(assignments.filter(x=>forbiddenKinds.has(x.action_kind)||!['OBSERVE','PROPOSE','REVERSIBLE_EXECUTE'].includes(x.capability_class)).length));

  const roster=byId('agent-roster');
  if(roster){
    roster.innerHTML=agents.length?agents.map(a=>{
      const mine=assignments.filter(x=>x.agent_id===a.id),complete=mine.filter(x=>x.status==='COMPLETE').length,queued=mine.filter(x=>x.status==='QUEUED'||x.status==='RUNNING').length;
      const allowed=Array.isArray(a.allowed_action_kinds)?a.allowed_action_kinds.map(x=>String(x).replaceAll('_',' ')).join(' · '):'—';
      return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(a.name)+'</div><div class="runbook-meta">'+esc(a.domain)+' · CEILING '+esc(capabilityClassName(a.capability_ceiling))+' · MAX OPEN '+esc(a.max_open_assignments)+'</div></div><span class="cmd-badge '+agentStatusBadge(a.status)+'">'+esc(a.status)+'</span></div><div class="intervention-copy">'+esc(a.description||'Governed specialist agent.')+'</div><div class="runbook-meta">BUDGET · '+esc(allowed)+'</div><div class="runbook-meta">COMPLETE '+esc(complete)+' · QUEUED '+esc(queued)+'</div></article>';
    }).join(''):'<div class="route-item"><small>No agent roster available yet.</small></div>';
  }

  const list=byId('agent-assignments');
  if(list){
    const agentById=new Map(agents.map(a=>[a.id,a]));
    list.innerHTML=assignments.length?assignments.slice(0,24).map(x=>{
      const a=agentById.get(x.agent_id),external=x.governance?.external_effects===true?'EXTERNAL EFFECT':'NO EXTERNAL EFFECT';
      const summary=x.output?.verdict||x.output?.research_packet?.proposal||x.output?.operations_packet?.work_package?.next_action||x.work_order?.title||'Governed assignment';
      return '<div class="action-receipt"><strong>'+esc(x.status)+' · '+esc(a?.name||'Agent')+'</strong>'+esc(capabilityClassName(x.capability_class))+' · '+esc(String(x.action_kind||'').replaceAll('_',' '))+'<br>'+esc(String(summary).slice(0,180))+'<br>'+esc(external)+' · '+esc(new Date(x.created_at).toLocaleString())+'</div>';
    }).join(''):'<div class="action-receipt">No workforce assignments yet.</div>';
  }
}
function setupAgents(){
  byId('sync-agents')?.addEventListener('click',()=>void syncAgentWorkforceConsole());
}


function renderPlannerCloudState(){
  const badge=byId('planner-cloud-state');if(!badge)return;
  const mode=state.plannerCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchPlannerTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'planner_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncPlannerConsole(){
  state.plannerCloud.state='SYNCING';renderPlannerCloudState();
  if(!await verifyCloudSession()){
    state.plannerCloud.state='LOCAL_ONLY';renderPlannerCloudState();renderPlanner();return;
  }
  try{
    const [plans,tasks,deps,escalations,events]=await Promise.all([
      fetchPlannerTable('command_plans?select=*&order=priority.desc,updated_at.desc'),
      fetchPlannerTable('command_plan_tasks?select=*&order=plan_id.asc,position.asc'),
      fetchPlannerTable('command_plan_dependencies?select=*&order=created_at.asc'),
      fetchPlannerTable('command_planner_escalations?select=*&order=priority.desc,updated_at.desc'),
      fetchPlannerTable('command_planner_events?select=*&order=created_at.desc&limit=100')
    ]);
    state.plans=plans;state.planTasks=tasks;state.planDependencies=deps;state.plannerEscalations=escalations;state.plannerEvents=events;
    state.plannerCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.plannerCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.plannerCloud.lastSync};
  }
  renderPlannerCloudState();renderPlanner();
}
function plannerStatusBadge(status){
  if(status==='READY'||status==='COMPLETE')return'good';
  if(status==='WAITING_HUMAN'||status==='ESCALATED'||status==='BLOCKED')return'warn';
  if(status==='STALE'||status==='FAILED')return'bad';
  return'warn';
}
async function resolvePlannerEscalation(id){
  if(!await verifyCloudSession())return;
  const row=state.plannerEscalations.find(x=>x.id===id);
  if(!row||row.signal_active===false||row.status==='RESOLVED')return;
  const response=prompt('Architect decision. State the bounded decision, condition, or instruction that clears this planner gate. This does not grant capital or external execution authority.','');
  if(response===null)return;
  if(!response.trim()){alert('A concrete owner response is required to clear the gate.');return}
  state.plannerCloud.state='SYNCING';renderPlannerCloudState();
  try{
    const r=await fetch(SUPABASE+'/rest/v1/rpc/command_resolve_planner_escalation',{
      method:'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({p_escalation_id:id,p_response:response.trim()}),
      cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    const data=await r.json().catch(()=>null);
    if(!r.ok)throw new Error(data?.message||data?.hint||'planner_escalation_resolution_failed');
    await fetchJson('/api/executive-cycle',65000);
    await Promise.allSettled([syncPlannerConsole(),syncAgentWorkforceConsole(),syncRunbooksConsole(),syncInterventions(),syncSchedulerConsole()]);
  }catch(error){
    state.plannerCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.plannerCloud.lastSync};
    renderPlannerCloudState();alert('Planner decision could not be committed. The gate remains closed.');
  }
}
function renderPlanner(){
  const plans=state.plans||[],tasks=state.planTasks||[],escalations=state.plannerEscalations||[],events=state.plannerEvents||[],agents=state.agents||[];
  const activePlans=plans.filter(x=>!['STALE','ARCHIVED'].includes(x.status));
  const activeEsc=escalations.filter(x=>x.signal_active!==false&&x.status!=='RESOLVED');
  set('planner-ready-kpi',String(activePlans.filter(x=>x.status==='READY').length));
  set('planner-human-kpi',String(activePlans.filter(x=>x.status==='WAITING_HUMAN').length));
  set('planner-escalation-kpi',String(activeEsc.length));
  set('planner-blocked-kpi',String(tasks.filter(x=>x.status==='BLOCKED'||x.status==='ESCALATED').length));

  const agentById=new Map(agents.map(a=>[a.id,a]));
  const list=byId('planner-list');
  if(list){
    list.innerHTML=activePlans.length?activePlans.map(p=>{
      const child=tasks.filter(t=>t.plan_id===p.id).sort((a,b)=>num(a.position)-num(b.position));
      const chain=child.map(t=>{
        const a=t.assigned_agent_id?agentById.get(t.assigned_agent_id):null;
        const owner=t.capability_class==='HUMAN_DECISION'?'ARCHITECT-STEWARD':(a?.name||t.domain);
        return '<div class="planner-node"><div class="step-num">'+esc(String(t.position).padStart(2,'0'))+'</div><div><strong>'+esc(t.title)+'</strong><small>'+esc(owner)+' · '+esc(capabilityClassName(t.capability_class))+' · '+esc(String(t.action_kind||'').replaceAll('_',' '))+'</small></div><span class="cmd-badge '+plannerStatusBadge(t.status)+'">'+esc(t.status)+'</span></div>';
      }).join('');
      const bottleneck=p.bottleneck?'<div class="planner-bottleneck"><strong>BOTTLENECK</strong><br>'+esc(p.bottleneck)+'</div>':'';
      return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(p.title)+'</div><div class="runbook-meta">'+esc(p.source_type)+' · '+esc(p.domain)+' · PRIORITY '+esc(p.priority)+' · VERSION '+esc(p.version)+'</div></div><span class="cmd-badge '+plannerStatusBadge(p.status)+'">'+esc(p.status)+'</span></div><div class="intervention-action">'+esc(p.objective||'Governed internal plan.')+'</div><div class="planner-path">'+chain+'</div>'+bottleneck+'<div class="planner-source">SOURCE '+esc(p.source_client_id)+' · FINGERPRINT '+esc(p.source_fingerprint)+'</div></article>';
    }).join(''):'<div class="route-item"><small>No active plans yet. V177 only compiles from real active projects or active Executive Inbox interventions.</small></div>';
  }

  const escBox=byId('planner-escalations');
  if(escBox){
    escBox.innerHTML=activeEsc.length?activeEsc.map(e=>{
      const plan=plans.find(p=>p.id===e.plan_id);
      return '<div class="planner-escalation"><strong>'+esc(e.status)+' · '+esc(plan?.title||'Planner Gate')+'</strong>'+esc(e.question)+'<br><span class="planner-source">'+esc(e.reason)+'</span><div class="intervention-actions"><button class="cmd-btn primary" data-resolve-planner="'+esc(e.id)+'">ARCHITECT DECISION</button></div></div>';
    }).join(''):'<div class="action-receipt">No active Architect decision gate.</div>';
    escBox.querySelectorAll('[data-resolve-planner]').forEach(btn=>btn.addEventListener('click',()=>void resolvePlannerEscalation(btn.dataset.resolvePlanner)));
  }

  const eventBox=byId('planner-events');
  if(eventBox){
    eventBox.innerHTML=events.length?events.slice(0,14).map(e=>{
      const plan=plans.find(p=>p.id===e.plan_id);
      return '<div class="action-receipt"><strong>'+esc(String(e.event_type||'').replaceAll('_',' '))+'</strong>'+esc(plan?.title||'Plan')+'<br>'+esc(e.note||'')+'<br>'+esc(new Date(e.created_at).toLocaleString())+'</div>';
    }).join(''):'<div class="action-receipt">No planner events yet.</div>';
  }
}
function setupPlanner(){
  byId('sync-planner')?.addEventListener('click',()=>void syncPlannerConsole());
}


function renderSchedulerCloudState(){
  const badge=byId('scheduler-cloud-state');if(!badge)return;
  const mode=state.schedulerCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchSchedulerTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'scheduler_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncSchedulerConsole(){
  state.schedulerCloud.state='SYNCING';renderSchedulerCloudState();
  if(!await verifyCloudSession()){
    state.schedulerCloud.state='LOCAL_ONLY';renderSchedulerCloudState();renderScheduler();return;
  }
  try{
    const [policies,items,events]=await Promise.all([
      fetchSchedulerTable('command_scheduler_policies?select=*&order=updated_at.desc'),
      fetchSchedulerTable('command_schedule_items?select=*&order=urgency_score.desc,due_at.asc'),
      fetchSchedulerTable('command_scheduler_events?select=*&order=created_at.desc&limit=120')
    ]);
    state.schedulerPolicies=policies;state.scheduleItems=items;state.schedulerEvents=events;
    state.schedulerCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.schedulerCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.schedulerCloud.lastSync};
  }
  renderSchedulerCloudState();renderScheduler();
}
function scheduleBadge(item){
  if(item.schedule_status==='DONE')return'good';
  if(item.breach_state==='BREACHED')return'bad';
  if(item.breach_state==='AT_RISK'||item.schedule_status==='WAITING_HUMAN'||item.capacity_state==='SATURATED')return'warn';
  return'good';
}
function minutesLabel(v){
  const n=Math.round(num(v)),sign=n<0?'-':'',x=Math.abs(n);
  if(x>=1440)return sign+(x/1440).toFixed(x%1440?1:0)+'d';
  if(x>=60)return sign+(x/60).toFixed(x%60?1:0)+'h';
  return sign+x+'m';
}
function renderScheduler(){
  const items=(state.scheduleItems||[]).filter(x=>x.schedule_status!=='STALE'),events=state.schedulerEvents||[];
  set('scheduler-critical-kpi',String(items.filter(x=>x.critical_path&&x.schedule_status!=='DONE').length));
  set('scheduler-risk-kpi',String(items.filter(x=>x.breach_state==='AT_RISK').length));
  set('scheduler-breach-kpi',String(items.filter(x=>x.breach_state==='BREACHED').length));
  set('scheduler-saturated-kpi',String(new Set(items.filter(x=>x.capacity_state==='SATURATED'&&x.assigned_agent_id).map(x=>x.assigned_agent_id)).size));

  const taskById=new Map((state.planTasks||[]).map(x=>[x.id,x]));
  const planById=new Map((state.plans||[]).map(x=>[x.id,x]));
  const agentById=new Map((state.agents||[]).map(x=>[x.id,x]));
  const list=byId('scheduler-list');
  if(list){
    const sorted=[...items].sort((a,b)=>num(b.urgency_score)-num(a.urgency_score)||new Date(a.due_at)-new Date(b.due_at));
    list.innerHTML=sorted.length?sorted.slice(0,30).map(x=>{
      const task=taskById.get(x.task_id),plan=planById.get(x.plan_id),agent=x.assigned_agent_id?agentById.get(x.assigned_agent_id):null;
      const owner=task?.capability_class==='HUMAN_DECISION'?'ARCHITECT-STEWARD':(agent?.name||task?.domain||'SYSTEM');
      const origin=String(x.deadline_origin||'INTERNAL_SLA').replaceAll('_',' ');
      const real=x.deadline_origin!=='INTERNAL_SLA'?'SOURCE DEADLINE':'INTERNAL SLA TARGET';
      const critical=x.critical_path&&x.schedule_status!=='DONE'?'<span class="critical-ribbon">CRITICAL PATH PRESSURE</span>':'';
      return '<article class="schedule-item"><div class="schedule-top"><div><div class="schedule-title">'+esc(plan?.title||'Plan')+' · '+esc(task?.title||'Task')+'</div><div class="schedule-meta">'+esc(owner)+' · '+esc(x.schedule_status.replaceAll('_',' '))+' · URGENCY '+esc(x.urgency_score)+'/100</div></div><span class="cmd-badge '+scheduleBadge(x)+'">'+esc(x.breach_state.replaceAll('_',' '))+'</span></div><div class="schedule-metrics"><div class="schedule-metric"><strong>'+esc(minutesLabel(x.slack_minutes))+'</strong><small>START SLACK</small></div><div class="schedule-metric"><strong>'+esc(minutesLabel(x.age_minutes))+'</strong><small>TASK AGE</small></div><div class="schedule-metric"><strong>'+esc(minutesLabel(x.sla_minutes))+'</strong><small>TASK SLA</small></div><div class="schedule-metric"><strong>'+esc(x.capacity_state)+'</strong><small>CAPACITY</small></div></div><div class="deadline-origin">'+esc(real)+' · '+esc(origin)+' · DUE '+esc(new Date(x.due_at).toLocaleString())+'</div>'+critical+'</article>';
    }).join(''):'<div class="route-item"><small>No active scheduled tasks yet.</small></div>';
  }

  const box=byId('scheduler-events');
  if(box){
    box.innerHTML=events.length?events.slice(0,18).map(e=>{
      const task=taskById.get(e.task_id),plan=planById.get(e.plan_id);
      return '<div class="action-receipt"><strong>'+esc(String(e.event_type||'').replaceAll('_',' '))+'</strong>'+esc(plan?.title||'Plan')+' · '+esc(task?.title||'Task')+'<br>'+esc(e.note||'')+'<br>'+esc(new Date(e.created_at).toLocaleString())+'</div>';
    }).join(''):'<div class="action-receipt">No SLA or stall events yet.</div>';
  }
}
function setupScheduler(){
  byId('sync-scheduler')?.addEventListener('click',()=>void syncSchedulerConsole());
}


function renderDispatchCloudState(){
  const badge=byId('dispatch-cloud-state');if(!badge)return;
  const mode=state.dispatchCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchDispatchTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'dispatch_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncDispatchConsole(){
  state.dispatchCloud.state='SYNCING';renderDispatchCloudState();
  if(!await verifyCloudSession()){
    state.dispatchCloud.state='LOCAL_ONLY';renderDispatchCloudState();renderDispatch();return;
  }
  try{
    const [policies,leases,events]=await Promise.all([
      fetchDispatchTable('command_dispatch_policies?select=*&order=updated_at.desc'),
      fetchDispatchTable('command_dispatch_leases?select=*&order=leased_at.desc&limit=120'),
      fetchDispatchTable('command_dispatch_events?select=*&order=created_at.desc&limit=160')
    ]);
    state.dispatchPolicies=policies;state.dispatchLeases=leases;state.dispatchEvents=events;
    state.dispatchCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.dispatchCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.dispatchCloud.lastSync};
  }
  renderDispatchCloudState();renderDispatch();
}
function dispatchBadge(status){
  if(status==='COMPLETE')return'good';
  if(status==='FAILED'||status==='EXPIRED'||status==='CANCELED')return'bad';
  return'warn';
}
function renderDispatch(){
  const leases=state.dispatchLeases||[],events=state.dispatchEvents||[],tasks=state.planTasks||[],plans=state.plans||[],agents=state.agents||[];
  set('dispatch-active-kpi',String(leases.filter(x=>['CLAIMED','RUNNING'].includes(x.status)).length));
  set('dispatch-complete-kpi',String(leases.filter(x=>x.status==='COMPLETE').length));
  set('dispatch-failed-kpi',String(leases.filter(x=>['FAILED','EXPIRED','CANCELED'].includes(x.status)).length));
  const external=leases.filter(x=>x.governance?.external_effects===true||x.governance?.funds_moved===true||x.governance?.trades_sent===true).length;
  set('dispatch-external-kpi',String(external));

  const taskById=new Map(tasks.map(x=>[x.id,x]));
  const planById=new Map(plans.map(x=>[x.id,x]));
  const agentById=new Map(agents.map(x=>[x.id,x]));
  const list=byId('dispatch-list');
  if(list){
    list.innerHTML=leases.length?leases.slice(0,30).map(x=>{
      const task=taskById.get(x.task_id),plan=planById.get(x.plan_id),agent=agentById.get(x.agent_id);
      const verdict=x.output?.verdict||x.output?.dispatch_receipt?.task_key||task?.title||'Internal work receipt';
      return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(plan?.title||'Governed plan')+' · '+esc(task?.title||'Task')+'</div><div class="runbook-meta">'+esc(agent?.name||'Specialist')+' · '+esc(String(task?.capability_class||'').replaceAll('_',' '))+' · '+esc(String(task?.action_kind||'').replaceAll('_',' '))+'</div></div><span class="cmd-badge '+dispatchBadge(x.status)+'">'+esc(x.status)+'</span></div><div class="intervention-copy">'+esc(String(verdict).slice(0,220))+'</div><div class="runbook-meta">LEASE '+esc(String(x.id).slice(0,8))+' · '+esc(new Date(x.leased_at).toLocaleString())+' · EXTERNAL EFFECTS '+esc(x.governance?.external_effects===true?'YES':'NO')+'</div></article>';
    }).join(''):'<div class="route-item"><small>No dispatch lease has been issued yet.</small></div>';
  }

  const box=byId('dispatch-events');
  if(box){
    box.innerHTML=events.length?events.slice(0,20).map(e=>{
      const task=taskById.get(e.task_id),plan=planById.get(e.plan_id);
      return '<div class="action-receipt"><strong>'+esc(String(e.event_type||'').replaceAll('_',' '))+'</strong>'+esc(plan?.title||'Plan')+' · '+esc(task?.title||'Task')+'<br>'+esc(e.note||'')+'<br>'+esc(new Date(e.created_at).toLocaleString())+'</div>';
    }).join(''):'<div class="action-receipt">No dispatcher events yet.</div>';
  }
}
function setupDispatch(){
  byId('sync-dispatch')?.addEventListener('click',()=>void syncDispatchConsole());
}


function renderKernelCloudState(){
  const badge=byId('kernel-cloud-state');if(!badge)return;
  const mode=state.kernelCloud.state;
  badge.className='cmd-badge '+(mode==='CLOUD_SYNCED'?'good':mode==='SYNCING'?'warn':mode==='CLOUD_ERROR'?'bad':'warn');
  badge.textContent=mode==='CLOUD_SYNCED'?'CLOUD SYNCED':mode==='SYNCING'?'SYNCING':mode==='CLOUD_ERROR'?'CLOUD ERROR':'SIGN IN REQUIRED';
}
async function fetchKernelTable(path){
  const response=await fetch(SUPABASE+'/rest/v1/'+path,{
    headers:{apikey:KEY,Authorization:'Bearer '+state.cloud.token,Accept:'application/json'},
    cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  const data=await response.json().catch(()=>[]);
  if(!response.ok)throw new Error(data?.message||'kernel_read_failed');
  return Array.isArray(data)?data:[];
}
async function syncKernelConsole(){
  state.kernelCloud.state='SYNCING';renderKernelCloudState();
  if(!await verifyCloudSession()){
    state.kernelCloud.state='LOCAL_ONLY';renderKernelCloudState();renderKernel();return;
  }
  try{
    const [policies,runs,kernelState,retries,deadLetters]=await Promise.all([
      fetchKernelTable('command_ops_kernel_policies?select=*&order=updated_at.desc'),
      fetchKernelTable('command_ops_kernel_runs?select=*&order=started_at.desc&limit=80'),
      fetchKernelTable('command_ops_kernel_state?select=*'),
      fetchKernelTable('command_dispatch_retries?select=*&order=updated_at.desc&limit=80'),
      fetchKernelTable('command_ops_dead_letters?select=*&order=created_at.desc&limit=80')
    ]);
    state.kernelPolicies=policies;state.kernelRuns=runs;state.kernelState=kernelState;
    state.dispatchRetries=retries;state.deadLetters=deadLetters;
    state.kernelCloud={state:'CLOUD_SYNCED',lastError:null,lastSync:new Date().toISOString()};
  }catch(error){
    state.kernelCloud={state:'CLOUD_ERROR',lastError:String(error),lastSync:state.kernelCloud.lastSync};
  }
  renderKernelCloudState();renderKernel();
}
function kernelBadge(v){
  const s=String(v||'').toUpperCase();
  if(s==='HEALTHY'||s==='SUCCEEDED'||s==='RECOVERED')return'good';
  if(s==='FAIL_CLOSED'||s==='FAILED'||s==='DEAD_LETTER')return'bad';
  return'warn';
}
function shortWhen(value){
  if(!value)return'—';
  const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'—';
}
function renderKernel(){
  const ks=(state.kernelState||[])[0]||null,runs=state.kernelRuns||[],retries=state.dispatchRetries||[],dead=state.deadLetters||[];
  set('kernel-health-kpi',ks?.health_state||'—');
  set('kernel-failures-kpi',String(ks?.consecutive_failures??0));
  set('kernel-dead-kpi',String(dead.filter(x=>x.status!=='RESOLVED').length));
  set('kernel-retry-kpi',ks?.next_retry_at?shortWhen(ks.next_retry_at):'—');

  const runBox=byId('kernel-runs');
  if(runBox){
    runBox.innerHTML=runs.length?runs.slice(0,20).map(r=>{
      const mode=r.metrics?.mode||r.error_stage||r.trigger_source||'HEARTBEAT';
      return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(String(mode).replaceAll('_',' '))+'</div><div class="runbook-meta">'+esc(r.trigger_source)+' · '+esc(shortWhen(r.started_at))+' · '+esc((r.duration_ms??0)+' ms')+'</div></div><span class="cmd-badge '+kernelBadge(r.status)+'">'+esc(r.status)+'</span></div><div class="intervention-copy">'+esc(r.error_detail||'Governed heartbeat completed without recorded error.')+'</div></article>';
    }).join(''):'<div class="route-item"><small>No kernel heartbeat receipts yet.</small></div>';
  }

  const recovery=byId('kernel-recovery');
  if(recovery){
    const openDead=dead.filter(x=>x.status!=='RESOLVED');
    const pending=retries.filter(x=>['PENDING','READY','DEAD_LETTER'].includes(x.status));
    const rows=[
      ...openDead.slice(0,10).map(x=>({kind:'DEAD LETTER',status:x.status,copy:x.reason,when:x.created_at})),
      ...pending.slice(0,10).map(x=>({kind:'RETRY '+x.attempt_count+'/'+x.max_attempts,status:x.status,copy:x.last_error||'Bounded retry state.',when:x.next_retry_at||x.updated_at}))
    ];
    recovery.innerHTML=rows.length?rows.map(x=>'<div class="action-receipt"><strong>'+esc(x.kind)+' · '+esc(x.status)+'</strong>'+esc(x.copy||'')+'<br>'+esc(shortWhen(x.when))+'</div>').join(''):'<div class="action-receipt">No pending retries or unresolved dead letters.</div>';
  }
}
function setupKernel(){
  byId('sync-kernel')?.addEventListener('click',()=>void syncKernelConsole());
}

function textState(data,fallback='UNKNOWN'){
  const candidates=[data?.state,data?.status,data?.health?.state,data?.machine_state,data?.decision?.state,data?.watch?.state,data?.desk_state];
  return String(candidates.find(v=>v!==undefined&&v!==null&&String(v).trim())??fallback).toUpperCase();
}
function severityFromText(value){
  const s=String(value||'').toUpperCase();
  if(/FAIL|ERROR|UNAVAILABLE|OFFLINE|CRITICAL/.test(s))return'bad';
  if(/DEGRADED|BLOCK|WAIT|WARN|STALE|WITHHELD|REVIEW|UNKNOWN/.test(s))return'warn';
  if(/HEALTHY|READY|LIVE|ACTIVE|CLEAR|PASS|OK|OPEN/.test(s))return'good';
  return'warn';
}
async function fetchJson(url,timeout=12000){
  const started=performance.now(),controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
    const data=await response.json().catch(()=>null);
    return{ok:response.ok&&data&&typeof data==='object',status:response.status,data,latency:Math.round(performance.now()-started)};
  }catch(error){
    return{ok:false,status:0,data:null,latency:Math.round(performance.now()-started),error:String(error).slice(0,120)};
  }finally{clearTimeout(timer)}
}

function governedPermission(){
  const r=state.sources.closure,data=r?.data;
  if(!r?.ok)return{action:'WAIT',capital:'0R',state:'FAIL CLOSED',copy:'Production closure is unavailable. Command OS defaults to WAIT / 0R.'};
  return{
    action:String(data?.governance?.action_permitted||'WAIT').toUpperCase(),
    capital:String(data?.governance?.capital_permission||'0R').toUpperCase(),
    state:String(data?.state||'GOVERNED').replaceAll('_',' '),
    copy:data?.closure?.note||'Upstream governance is authoritative. Command OS cannot loosen it.'
  };
}

function buildQueue(){
  const items=[],add=(score,title,copy,type='SYSTEM')=>items.push({score,title,copy,type});
  const cr=state.sources.closure,c=cr?.data,qr=state.sources.q4,q=qr?.data,dr=state.sources.quality,cal=state.sources.calendar?.data;
  if(!cr?.ok)add(100,'Restore production closure visibility','The sovereign gate is unavailable, so all permissions remain fail-closed.','GOVERNANCE');
  const blockers=Array.isArray(c?.execution_release?.blockers)?c.execution_release.blockers:[];
  blockers.slice(0,5).forEach((b,i)=>add(96-i,String(b).replaceAll('_',' '),'Resolve or verify this blocker before considering any execution promotion.','BLOCKER'));
  if(!qr?.ok)add(92,'Restore Q4 readiness watcher','Readiness changes cannot be compressed while the canonical watcher is unavailable.','OBSERVABILITY');
  const signals=Array.isArray(q?.signals)?q.signals:[];
  signals.filter(s=>String(s?.severity).toUpperCase()==='HIGH').slice(0,4).forEach((s,i)=>add(90-i,String(s?.code||'Q4 high-severity signal').replaceAll('_',' '),s?.message||'High-severity watcher signal requires review.','Q4'));
  if(q?.watch?.candidate_ready===true)add(89,'Human review of prepared candidate','A governed candidate is reviewable. Review does not grant capital or execution permission.','HUMAN REVIEW');
  if(!dr?.ok)add(88,'Restore data-quality sentinel','Do not promote decisions while the quality layer is unavailable.','DATA');
  else{
    const qs=textState(dr.data);
    if(severityFromText(qs)!=='good')add(86,'Resolve data-quality state','Data quality reports '+qs+'. Treat uncertain inputs as a reason to wait.','DATA');
  }
  const events=Array.isArray(cal?.events)?cal.events:[];
  const upcoming=events.filter(e=>String(e?.impact||'').toUpperCase()==='HIGH'&&new Date(e.datetime).getTime()>Date.now()).sort((a,b)=>new Date(a.datetime)-new Date(b.datetime))[0];
  if(upcoming){
    const hours=(new Date(upcoming.datetime).getTime()-Date.now())/36e5;
    if(hours<=24)add(72,'Macro window: '+(upcoming.title||'High-impact event'),Math.max(0,hours).toFixed(1)+'h away. Event proximity is context, not trading permission.','CALENDAR');
  }
  state.ledger.filter(x=>x.status==='OPEN').forEach(x=>add(50+Math.round(num(x.confidence)/10),x.title,x.nextAction||x.thesis||'Open decision awaiting evidence.','DECISION · '+x.domain));
  state.org.projects.filter(x=>x.status==='BLOCKED'||String(x.blocker||'').trim()).forEach(x=>add(Math.max(70,projectScore(x)),x.title,x.blocker||'Project is blocked and needs constraint removal.','ORG · BLOCKED'));
  state.org.projects.filter(x=>x.status==='ACTIVE').sort((a,b)=>projectScore(b)-projectScore(a)).slice(0,3).forEach(x=>add(Math.max(55,projectScore(x)),x.title,x.nextAction||'Highest-ranked active project.','ORG · '+x.domain));
  state.biz.units.filter(x=>String(x.blocker||'').trim()).forEach(x=>add(Math.max(72,businessScore(x)),x.name,x.blocker,'BUSINESS · BLOCKED'));
  state.biz.products.filter(x=>String(x.blocker||'').trim()).forEach(x=>add(Math.max(70,productScore(x)),x.name,x.blocker,'PRODUCT · BLOCKED'));
  state.biz.units.filter(x=>x.status==='ACTIVE').sort((a,b)=>businessScore(b)-businessScore(a)).slice(0,2).forEach(x=>add(Math.max(56,businessScore(x)),x.name,x.nextAction||'Highest-ranked active business unit.','BUSINESS · '+x.category));
  state.biz.products.filter(x=>x.status==='ACTIVE').sort((a,b)=>productScore(b)-productScore(a)).slice(0,2).forEach(x=>add(Math.max(54,productScore(x)),x.name,x.nextAction||'Highest-ranked active product.','PRODUCT · '+x.productType));
  state.allocations.filter(x=>x.status==='PROPOSED'&&!x.humanApproved).slice(0,3).forEach(x=>{const b=linkedBusiness(x.businessId),p=linkedProduct(x.productId);add(optionalNumber(x.amount)!==null?66:58,'Review resource proposal: '+(p?.name||b?.name||x.allocationType),x.rationale||'Human approval required before activation.','RESOURCE · HUMAN REVIEW')});
  state.outcomes.filter(x=>['PLANNED','RUNNING'].includes(x.status)&&x.dueAt&&new Date(x.dueAt).getTime()<Date.now()).slice(0,3).forEach(x=>add(74,'Resolve overdue outcome: '+x.title,'Measurement window has passed. Record actual evidence or cancel the experiment.','OUTCOME · OVERDUE'));
  state.outcomes.filter(x=>x.status==='RESOLVED'&&outcomePerformance(x)!==null&&outcomePerformance(x)<45).slice(0,3).forEach(x=>add(61,'Review weak outcome: '+x.title,'Observed performance scored '+Math.round(outcomePerformance(x))+'/100. Revisit assumptions before increasing resources.','LEARNING'));
  const seen=new Set();
  return items.sort((a,b)=>b.score-a.score).filter(x=>{const k=x.title.toLowerCase();if(seen.has(k))return false;seen.add(k);return true}).slice(0,12);
}

function renderExecutive(){
  const g=governedPermission(),q=state.sources.q4?.data,c=state.sources.closure?.data,queue=buildQueue();
  set('sovereign-state',g.state);set('sovereign-copy',g.copy);set('action-permission',g.action);set('capital-permission',g.capital);
  const changed=q?.decision_compression?.what_changed||(c?.state?'Production closure: '+String(c.state).replaceAll('_',' ')+'.':'Canonical state unavailable.');
  const matters=q?.decision_compression?.what_matters_now||(c?.execution_release?.blocker_count?c.execution_release.blocker_count+' execution blockers remain.':'Preserve evidence quality and governed permission.');
  const judgment=queue.find(x=>x.type==='HUMAN REVIEW')||queue[0];
  let command='Observe. Record. Do not outrun the evidence.';
  if(!state.sources.closure?.ok)command='Restore the sovereign gate before making capital-bearing decisions.';
  else if(c?.execution_release?.blocker_count>0)command='Resolve the highest-value blocker. Keep permission at '+g.action+' / '+g.capital+'.';
  else if(q?.watch?.candidate_ready===true)command='Review the prepared candidate without promoting exposure automatically.';
  else if(g.action==='WAIT'||g.capital==='0R')command='Let the machine watch. Human attention goes only to evidence quality and unresolved decisions.';
  set('what-changed',changed);set('what-matters',matters);set('judgment-now',judgment?judgment.title:'No irreversible decision requires attention.');set('today-command',command);
}

function renderQueue(){
  const queue=buildQueue(),host=byId('priority-list');set('queue-count',String(queue.length));if(!host)return;
  host.innerHTML=queue.length?queue.map(x=>'<article class="priority-item"><div class="priority-score">'+esc(x.score)+'</div><div><div class="priority-title">'+esc(x.title)+'</div><div class="priority-copy">'+esc(x.copy)+'</div></div><div class="priority-type">'+esc(x.type)+'</div></article>').join(''):'<div class="empty">No urgent queue items. Preserve optionality and let the machine observe.</div>';
}

function renderHealth(){
  const host=byId('health-grid');if(!host)return;let healthy=0;
  host.innerHTML=SOURCE_DEFS.map(def=>{
    const r=state.sources[def.key];let label='OFFLINE',cls='bad',meta='No response';
    if(r?.ok){
      label=textState(r.data,'RESPONDING');cls=severityFromText(label);if(cls==='good')healthy++;
      meta=r.status+' · '+r.latency+'ms';
      if(def.key==='gold'){const px=r.data?.quote?.price??r.data?.price??r.data?.quote?.mid;if(px!=null)meta+=' · XAUUSD '+px}
    }
    return '<div class="health-item"><div class="health-top"><span class="health-name">'+esc(def.name)+'</span><span class="health-state '+cls+'">'+esc(label)+'</span></div><div class="health-meta">'+esc(meta)+(def.critical?' · CRITICAL':'')+'</div></div>';
  }).join('');
  const total=SOURCE_DEFS.length,ratio=Math.round(healthy/total*100),badge=byId('health-score');
  if(badge){badge.textContent=healthy+'/'+total+' HEALTHY · '+ratio+'%';badge.className='cmd-badge '+(ratio>=80?'good':ratio>=50?'warn':'bad')}
}

function renderSteward(){
  const queue=buildQueue(),healthy=SOURCE_DEFS.filter(d=>state.sources[d.key]?.ok).length,open=state.ledger.filter(x=>x.status==='OPEN'),low=open.filter(x=>num(x.confidence)<40),human=queue.filter(x=>x.type==='HUMAN REVIEW'||x.type==='GOVERNANCE').length;
  set('steward-judgment',human?human+' HUMAN GATE'+(human===1?'':'S'):'1 PRIORITY');
  set('steward-judgment-copy',queue[0]?.title||'No high-priority irreversible decision is currently surfaced.');
  set('steward-system',healthy+' LIVE SOURCES');set('steward-system-copy','Observation, health checks, compression and evidence capture remain machine work.');
  set('steward-defer',low.length?low.length+' LOW-CONFIDENCE':'PROTECT FOCUS');
  set('steward-defer-copy',low.length?'Low-confidence open decisions are candidates for deferral until evidence improves.':'Do not create new work merely because the queue is quiet.');
}

function ledgerMetrics(){
  const resolved=state.ledger.filter(x=>x.status==='RESOLVED'&&['SUCCESS','FAILURE'].includes(x.outcome)),success=resolved.filter(x=>x.outcome==='SUCCESS');
  const hit=resolved.length?success.length/resolved.length*100:null;
  let calibration=null;
  if(resolved.length){
    const mae=resolved.reduce((sum,x)=>{const p=Math.max(0,Math.min(100,num(x.confidence)))/100,y=x.outcome==='SUCCESS'?1:0;return sum+Math.abs(p-y)},0)/resolved.length;
    calibration=Math.max(0,100-mae*100);
  }
  return{open:state.ledger.filter(x=>x.status==='OPEN').length,resolved:state.ledger.filter(x=>x.status==='RESOLVED').length,hit,calibration};
}

function renderLedger(){
  const m=ledgerMetrics();set('memory-open',String(m.open));set('memory-resolved',String(m.resolved));set('memory-hit',m.hit==null?'—':m.hit.toFixed(0)+'%');set('memory-calibration',m.calibration==null?'—':m.calibration.toFixed(0)+'%');
  const host=byId('decision-ledger');if(!host)return;
  const rows=state.ledger.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  host.innerHTML=rows.length?rows.map(x=>{
    const buttons=x.status!=='RESOLVED'?'<button class="cmd-btn mini" data-resolve="'+esc(x.id)+'" data-outcome="SUCCESS">WIN</button><button class="cmd-btn mini" data-resolve="'+esc(x.id)+'" data-outcome="FAILURE">MISS</button><button class="cmd-btn mini" data-resolve="'+esc(x.id)+'" data-outcome="NEUTRAL">NEUTRAL</button>':'';
    return '<tr><td>'+esc(new Date(x.createdAt).toLocaleString())+'</td><td>'+esc(x.domain)+'</td><td><strong>'+esc(x.title)+'</strong><br><span class="cmd-muted">'+esc(x.nextAction||'')+'</span></td><td>'+esc(x.confidence)+'%</td><td>'+esc(x.status)+'</td><td class="'+(x.outcome==='SUCCESS'?'positive':x.outcome==='FAILURE'?'negative':'')+'">'+esc(x.outcome||'—')+'</td><td>'+esc(x.lesson||'—')+'</td><td><div class="outcome-actions">'+buttons+'<button class="cmd-btn mini danger" data-delete="'+esc(x.id)+'">DELETE</button></div></td></tr>';
  }).join(''):'<tr><td colspan="8"><div class="empty">No frozen decisions yet. The learning loop begins when a thesis is recorded before the outcome.</div></td></tr>';
  host.querySelectorAll('[data-resolve]').forEach(btn=>btn.addEventListener('click',()=>{
    const item=state.ledger.find(x=>x.id===btn.dataset.resolve);if(!item)return;
    const lesson=prompt('What did this decision teach the machine?')||'';
    item.status='RESOLVED';item.outcome=btn.dataset.outcome;item.lesson=lesson.trim();item.resolvedAt=new Date().toISOString();item.updatedAt=new Date().toISOString();saveLedger();renderAll();void syncItemToCloud(item);
  }));
  host.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{const id=btn.dataset.delete;state.ledger=state.ledger.filter(x=>x.id!==id);saveLedger();renderAll();void deleteCloudItem(id)}));
}

function renderScenario(){
  const c=state.sources.closure?.data,q=state.sources.q4?.data,queue=buildQueue(),m=ledgerMetrics(),blockers=num(c?.execution_release?.blocker_count),healthy=SOURCE_DEFS.filter(d=>state.sources[d.key]?.ok).length,candidate=q?.watch?.candidate_ready===true,g=governedPermission();
  let copy='Scenario projection: the version ahead opens one cockpit, not ten. '+healthy+' of '+SOURCE_DEFS.length+' command sources are responding. ';
  copy+=blockers>0?blockers+' execution blockers remain, so the Architect-Steward removes constraints before adding complexity. ':'No execution blocker count is currently surfaced by the closure gate. ';
  if(candidate)copy+='A candidate is ready for human review, but review remains separate from capital permission. ';
  copy+='The decision ledger contains '+m.open+' open and '+m.resolved+' resolved decisions. The next state is reached by closing feedback loops until judgment becomes rarer and higher-value. Current authority remains '+g.action+' / '+g.capital+'. ';
  const om=outcomeMetrics();copy+=' Execution learning contains '+om.running+' running and '+om.resolved.length+' resolved outcome'+(om.resolved.length===1?'':'s')+(om.accuracy==null?'. ':' with '+om.accuracy.toFixed(0)+'% expectation accuracy. ');
  copy+=queue[0]?'The highest-priority move is: '+queue[0].title+'.':'No urgent action is required. The system earns the right to stay quiet.';
  set('future-scenario',copy);
}

function renderAll(){renderExecutive();renderQueue();renderHealth();renderSteward();renderOrganization();renderAttentionRouter();renderBusinessBrain();renderAllocationBrain();renderOutcomeBrain();renderExecutiveCycle();renderInterventions();renderRunbooks();renderAgents();renderPlanner();renderScheduler();renderDispatch();renderKernel();renderLedger();renderScenario();renderOrgCloudState();renderBizCloudState();renderAllocCloudState();renderOutcomeCloudState();renderCycleCloudState();renderInterventionCloudState();renderRunbookCloudState();renderAgentCloudState();renderPlannerCloudState();renderSchedulerCloudState();renderDispatchCloudState();renderKernelCloudState()}

function setupLedger(){
  const form=byId('decision-form');
  form?.addEventListener('submit',e=>{
    e.preventDefault();const row=Object.fromEntries(new FormData(form).entries());
    const now=new Date().toISOString();const item={...row,id:uid(),outcome:null,lesson:'',createdAt:now,updatedAt:now};state.ledger.push(item);saveLedger();form.reset();void syncItemToCloud(item);
    const confidence=form.querySelector('[name=confidence]');if(confidence)confidence.value='50';renderAll();
  });
  byId('export-ledger')?.addEventListener('click',()=>download('tfa-command-ledger-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:'v168',exportedAt:new Date().toISOString(),governance:governedPermission(),decisions:state.ledger},null,2)));
  byId('clear-ledger')?.addEventListener('click',()=>{if(confirm('Clear this device cache only? Cloud memory, if synced, will remain and can restore on the next sync.')){state.ledger=[];saveLedger();renderAll()}});byId('sync-cloud')?.addEventListener('click',()=>void syncCloudMemory());
}

async function syncMachine(){
  const btn=byId('refresh-command');if(btn){btn.disabled=true;btn.textContent='SYNCING COMMAND STATE'}
  const settled=await Promise.all(SOURCE_DEFS.map(async def=>[def.key,await fetchJson(def.url,def.critical?16000:12000)]));
  state.sources=Object.fromEntries(settled);state.lastSync=new Date().toISOString();renderAll();
  if(btn){btn.disabled=false;btn.textContent='REFRESH COMMAND STATE'}
}

function boot(){
  setupLedger();setupOrganization();setupBusinessBrain();setupAllocationBrain();setupOutcomeBrain();setupExecutiveCycle();setupInterventions();setupRunbooks();setupAgents();setupPlanner();setupScheduler();setupDispatch();setupKernel();renderLedger();renderOrganization();renderAttentionRouter();renderBusinessBrain();renderAllocationBrain();renderOutcomeBrain();renderExecutiveCycle();renderInterventions();renderRunbooks();renderAgents();renderPlanner();renderScheduler();renderDispatch();renderKernel();renderCloudState();renderOrgCloudState();renderBizCloudState();renderAllocCloudState();renderOutcomeCloudState();renderCycleCloudState();renderInterventionCloudState();renderRunbookCloudState();renderAgentCloudState();renderPlannerCloudState();renderSchedulerCloudState();renderDispatchCloudState();renderKernelCloudState();byId('refresh-command')?.addEventListener('click',syncMachine);void Promise.allSettled([syncMachine(),syncCloudMemory(),syncOrganization(),syncBusinessBrain(),syncAllocationBrain(),syncOutcomeBrain(),syncInterventions(),syncRunbooksConsole(),syncAgentWorkforceConsole(),syncPlannerConsole(),syncSchedulerConsole(),syncDispatchConsole(),syncKernelConsole()]).then(()=>void runExecutiveCycle());setInterval(()=>void syncMachine().then(()=>void runExecutiveCycle()),60000);setInterval(()=>void syncCloudMemory(),300000);setInterval(()=>void syncOrganization(),300000);setInterval(()=>void syncBusinessBrain(),300000);setInterval(()=>void syncAllocationBrain(),300000);setInterval(()=>void syncOutcomeBrain(),300000);setInterval(()=>void syncInterventions(),300000);setInterval(()=>void syncRunbooksConsole(),300000);setInterval(()=>void syncAgentWorkforceConsole(),300000);setInterval(()=>void syncPlannerConsole(),300000);setInterval(()=>void syncSchedulerConsole(),300000);setInterval(()=>void syncDispatchConsole(),300000);setInterval(()=>void syncKernelConsole(),300000);
}
boot();
