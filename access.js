import{api,gatewayHealth,stateClass,esc}from'./common.js?v=52.2.0';
const p=document.getElementById('accessPill'),d=document.getElementById('accessDetail');
const g=await gatewayHealth();
try{
  const x=await api('public-final-readiness',{ttl:120000});
  const gs=g.ok?'gateway ready':'gateway check';
  p.textContent=g.ok?'ACCESS READY':String(x.state||'VERIFYING').replaceAll('_',' ');
  p.className='pill '+stateClass(g.ok?'READY':x.state);
  d.innerHTML=`<strong>Gateway:</strong> ${esc(gs)} · <strong>Provider Edge limit:</strong> ${esc(x.runtime?.provider_rate_limit_status||'unknown')} · <strong>Canonical routes:</strong> ${x.routing?.canonical_ready?'ready':'pending'} · <strong>Billing:</strong> ${esc(x.commercial?.acceptance_state||'pending')}`;
}catch{
  p.textContent=g.ok?'GATEWAY READY':'ACCESS CHECK';
  p.className='pill '+stateClass(g.ok?'READY':'CHECK');
  d.textContent=g.ok?'Same-origin access gateway is responding. Readiness telemetry is delayed.':'Gateway/readiness check is unavailable. Password sign-in can still be attempted once.';
}
