import './styles.css';

const LEDGER_KEY='tfa.v168.command.decisions.v1';
const ORG_KEY='tfa.v169.organization.v1';
const SUPABASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const SESSION_KEY='tfa_session';
const state={ledger:loadLedger(),org:loadOrg(),sources:{},lastSync:null,cloud:{token:null,userId:null,state:'LOCAL_ONLY',lastError:null,lastSync:null},orgCloud:{state:'LOCAL_ONLY',lastError:null,lastSync:null}};
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
  const objective=linkedObjective(project),priority=num(objective?.priority)||3;
  let score=num(project.impact)*12+num(project.confidence)*0.25+priority*6-num(project.effort)*6;
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
  copy+=queue[0]?'The highest-priority move is: '+queue[0].title+'.':'No urgent action is required. The system earns the right to stay quiet.';
  set('future-scenario',copy);
}

function renderAll(){renderExecutive();renderQueue();renderHealth();renderSteward();renderOrganization();renderLedger();renderScenario();renderOrgCloudState()}

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
  setupLedger();setupOrganization();renderLedger();renderOrganization();renderCloudState();renderOrgCloudState();byId('refresh-command')?.addEventListener('click',syncMachine);void Promise.allSettled([syncMachine(),syncCloudMemory(),syncOrganization()]);setInterval(()=>void syncMachine(),60000);setInterval(()=>void syncCloudMemory(),300000);setInterval(()=>void syncOrganization(),300000);
}
boot();
