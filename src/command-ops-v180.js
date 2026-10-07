const SUPABASE='https://mpcelmjiycjpdyyflisn.supabase.co';
const KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const SESSION_KEY='tfa_session';

const q=id=>document.getElementById(id);
const esc=v=>String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const token=()=>{try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')?.access_token||null}catch{return null}};
const relative=value=>{
  if(!value)return'—';
  const t=new Date(value).getTime();if(!Number.isFinite(t))return'—';
  const d=Math.round((Date.now()-t)/1000),a=Math.abs(d),suffix=d>=0?' ago':' ahead';
  if(a<60)return a+'s'+suffix;
  if(a<3600)return Math.round(a/60)+'m'+suffix;
  if(a<86400)return Math.round(a/3600)+'h'+suffix;
  return Math.round(a/86400)+'d'+suffix;
};
const badge=status=>['HEALTHY','SUCCEEDED','RESOLVED'].includes(status)?'good':['FAIL_CLOSED','FAILED','DEAD_LETTERED','OPEN'].includes(status)?'bad':'warn';

async function session(){
  const access=token();if(!access)return null;
  const r=await fetch(SUPABASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+access,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
  const user=await r.json().catch(()=>null);
  return r.ok&&user?.id?{access,user}:null;
}
async function rows(access,path){
  const r=await fetch(SUPABASE+'/rest/v1/'+path,{headers:{apikey:KEY,Authorization:'Bearer '+access,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(12000)});
  const data=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error(data?.message||'ops_read_failed');
  return Array.isArray(data)?data:[];
}
function setCloud(mode){
  const el=q('ops-cloud-state');if(!el)return;
  el.className='cmd-badge '+(mode==='CLOUD SYNCED'?'good':mode==='CLOUD ERROR'?'bad':'warn');
  el.textContent=mode;
}
function render({health,runs,events,dead}){
  const h=health[0]||null;
  if(q('ops-health-kpi'))q('ops-health-kpi').textContent=h?.state||'—';
  if(q('ops-success-kpi'))q('ops-success-kpi').textContent=h?.last_success_at?relative(h.last_success_at):'—';
  if(q('ops-failures-kpi'))q('ops-failures-kpi').textContent=String(Number(h?.consecutive_failures||0));
  if(q('ops-dead-kpi'))q('ops-dead-kpi').textContent=String(dead.filter(x=>['OPEN','RETRYING'].includes(x.status)).length);

  const runBox=q('ops-runs');
  if(runBox)runBox.innerHTML=runs.length?runs.slice(0,24).map(r=>{
    const summary=r.summary||{};
    const detail=[
      String(r.trigger_type||'').replaceAll('_',' '),
      'ATTEMPT '+(r.attempt_no||1),
      summary.completed_dispatches!=null?'DISPATCHED '+summary.completed_dispatches:''
    ].filter(Boolean).join(' · ');
    return '<article class="runbook-item"><div class="runbook-top"><div><div class="runbook-title">'+esc(r.run_key||'Heartbeat')+'</div><div class="runbook-meta">'+esc(detail)+'</div></div><span class="cmd-badge '+badge(r.status)+'">'+esc(r.status)+'</span></div><div class="intervention-copy">'+esc(r.error_detail||'Continuous operations heartbeat receipt.')+'</div><div class="runbook-meta">START '+esc(new Date(r.started_at).toLocaleString())+(r.finished_at?' · END '+esc(new Date(r.finished_at).toLocaleString()):'')+(r.next_retry_at?' · RETRY '+esc(new Date(r.next_retry_at).toLocaleString()):'')+'</div></article>';
  }).join(''):'<div class="route-item"><small>No heartbeat receipts yet.</small></div>';

  const eventBox=q('ops-events');
  if(eventBox){
    const merged=[
      ...events.map(x=>({time:x.created_at,type:x.event_type,note:x.note,evidence:x.evidence||{}})),
      ...dead.filter(x=>['OPEN','RETRYING'].includes(x.status)).map(x=>({time:x.last_failed_at,type:'DEAD LETTER',note:x.category+' · '+x.last_error,evidence:{failure_count:x.failure_count}}))
    ].sort((a,b)=>new Date(b.time)-new Date(a.time));
    eventBox.innerHTML=merged.length?merged.slice(0,24).map(e=>'<div class="action-receipt"><strong>'+esc(String(e.type||'').replaceAll('_',' '))+'</strong>'+esc(e.note||'')+'<br>'+esc(new Date(e.time).toLocaleString())+(e.evidence?.failure_count!=null?'<br>FAILURES '+esc(e.evidence.failure_count):'')+'</div>').join(''):'<div class="action-receipt">No recovery or dead-letter events yet.</div>';
  }
}
async function sync(){
  setCloud('SYNCING');
  const s=await session();
  if(!s){setCloud('SIGN IN REQUIRED');return}
  try{
    const [health,runs,events,dead]=await Promise.all([
      rows(s.access,'command_ops_health_state?select=*&order=updated_at.desc'),
      rows(s.access,'command_ops_runs?select=*&order=started_at.desc&limit=100'),
      rows(s.access,'command_ops_events?select=*&order=created_at.desc&limit=160'),
      rows(s.access,'command_ops_dead_letters?select=*&order=last_failed_at.desc&limit=100')
    ]);
    render({health,runs,events,dead});setCloud('CLOUD SYNCED');
  }catch(error){
    setCloud('CLOUD ERROR');
    const box=q('ops-events');if(box)box.innerHTML='<div class="action-receipt"><strong>V180 DATA UNAVAILABLE</strong>'+esc(String(error))+'</div>';
  }
}
q('sync-ops')?.addEventListener('click',()=>void sync());
void sync();
setInterval(()=>void sync(),300000);
