export const RAW_SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const LOCAL_HOSTS=new Set(['localhost','127.0.0.1','::1']);
const IS_WEB=/^https?:$/.test(location.protocol);
const USE_GATEWAY=IS_WEB&&!LOCAL_HOSTS.has(location.hostname)&&location.origin!==RAW_SUPABASE_URL;
export const SUPABASE_URL=USE_GATEWAY?location.origin:RAW_SUPABASE_URL;
export const GATEWAY_MODE=USE_GATEWAY?'same-origin':'direct-development';
export const BASE=`${SUPABASE_URL}/functions/v1`;
export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const cache=new Map(),inflight=new Map(),GET_TTL=120000;
function urlFor(path){return path.startsWith('http')?path:`${BASE}/${path}`}
export async function api(path,options={}){
  const method=String(options.method||'GET').toUpperCase(),ttl=Number(options.ttl??GET_TTL),url=urlFor(path),key=`${method}:${url}`,now=Date.now();
  if(method==='GET'){const c=cache.get(key);if(c&&now-c.at<ttl)return c.data;if(inflight.has(key))return inflight.get(key)}
  const run=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Number(options.timeout||15000));if(options.signal)options.signal.addEventListener('abort',()=>controller.abort(),{once:true});try{const r=await fetch(url,{...options,method,signal:controller.signal,headers:{Accept:'application/json',...(options.headers||{})}}),text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,400)}}if(!r.ok||data?.ok===false){const e=new Error(data?.error||data?.message||`${path} ${r.status}`);e.status=r.status;e.data=data;throw e}if(method==='GET')cache.set(key,{at:Date.now(),data});return data}finally{clearTimeout(timeout);if(method==='GET')inflight.delete(key)}})();
  if(method==='GET')inflight.set(key,run);return run
}
export async function gatewayHealth(){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7000);try{const r=await fetch(USE_GATEWAY?'/__tfa/health':'/health.json',{cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});const j=await r.json().catch(()=>({}));return {ok:r.ok&&j?.ok!==false,...j,http_status:r.status,mode:GATEWAY_MODE}}catch(e){return {ok:false,error:e?.name==='AbortError'?'gateway_timeout':'gateway_unreachable',mode:GATEWAY_MODE}}finally{clearTimeout(timeout)}}
export function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
export function fmtDate(v){if(!v)return '—';try{return new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(v))}catch{return String(v)}}
export function stateClass(v){const s=String(v||'').toUpperCase();return /READY|ONLINE|ACTIVE|HEALTHY|GO|VERIFIED|GRANTED|LIFTED/.test(s)?'good':/DEGRADED|ERROR|FAILED|BLOCKED|HOLD|REJECTED/.test(s)?'bad':'wait'}
