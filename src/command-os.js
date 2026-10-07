import './styles.css';

const LEDGER_KEY='tfa.v168.command.decisions.v1';
const state={ledger:loadLedger(),sources:{},lastSync:null};
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
function download(name,content){const blob=new Blob([content],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500)}
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
  state.ledger.filter(x=>x.status==='OPEN').forEach(x=>add(50+Math.round(num(x.confidence)/10),x.title,x.nextAction||x.thesis||'Open decision awaiting evidence.','LOCAL · '+x.domain));
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
    item.status='RESOLVED';item.outcome=btn.dataset.outcome;item.lesson=lesson.trim();item.resolvedAt=new Date().toISOString();saveLedger();renderAll();
  }));
  host.querySelectorAll('[data-delete]').forEach(btn=>btn.addEventListener('click',()=>{state.ledger=state.ledger.filter(x=>x.id!==btn.dataset.delete);saveLedger();renderAll()}));
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

function renderAll(){renderExecutive();renderQueue();renderHealth();renderSteward();renderLedger();renderScenario()}

function setupLedger(){
  const form=byId('decision-form');
  form?.addEventListener('submit',e=>{
    e.preventDefault();const row=Object.fromEntries(new FormData(form).entries());
    state.ledger.push({...row,id:uid(),outcome:null,lesson:'',createdAt:new Date().toISOString()});saveLedger();form.reset();
    const confidence=form.querySelector('[name=confidence]');if(confidence)confidence.value='50';renderAll();
  });
  byId('export-ledger')?.addEventListener('click',()=>download('tfa-command-ledger-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:'v168',exportedAt:new Date().toISOString(),governance:governedPermission(),decisions:state.ledger},null,2)));
  byId('clear-ledger')?.addEventListener('click',()=>{if(confirm('Clear the browser-local Command OS decision ledger? Export first if you need a backup.')){state.ledger=[];saveLedger();renderAll()}});
}

async function syncMachine(){
  const btn=byId('refresh-command');if(btn){btn.disabled=true;btn.textContent='SYNCING COMMAND STATE'}
  const settled=await Promise.all(SOURCE_DEFS.map(async def=>[def.key,await fetchJson(def.url,def.critical?16000:12000)]));
  state.sources=Object.fromEntries(settled);state.lastSync=new Date().toISOString();renderAll();
  if(btn){btn.disabled=false;btn.textContent='REFRESH COMMAND STATE'}
}

function boot(){
  setupLedger();renderLedger();byId('refresh-command')?.addEventListener('click',syncMachine);void syncMachine();setInterval(()=>void syncMachine(),60000);
}
boot();
