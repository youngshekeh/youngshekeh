export const RAW_SUPABASE_URL='https://mpcelmjiycjpdyyflisn.supabase.co';
const CANONICAL_HOSTS=new Set(['thefatheranalytics.com','www.thefatheranalytics.com']);
export const SUPABASE_URL=CANONICAL_HOSTS.has(location.hostname)?location.origin:RAW_SUPABASE_URL;
export const BASE=`${SUPABASE_URL}/functions/v1`;
export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
const cache=new Map(),inflight=new Map(),GET_TTL=120000;
function urlFor(path){return path.startsWith('http')?path:`${BASE}/${path}`}
export async function api(path,options={}){const method=String(options.method||'GET').toUpperCase(),ttl=Number(options.ttl??GET_TTL),url=urlFor(path),key=`${method}:${url}`,now=Date.now();if(method==='GET'){const c=cache.get(key);if(c&&now-c.at<ttl)return c.data;if(inflight.has(key))return inflight.get(key)}const run=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),Number(options.timeout||15000));try{const r=await fetch(url,{...options,method,signal:options.signal||controller.signal,headers:{Accept:'application/json',...(options.headers||{})}}),text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,400)}}if(!r.ok||data?.ok===false){const e=new Error(data?.error||data?.message||`${path} ${r.status}`);e.status=r.status;e.data=data;throw e}if(method==='GET')cache.set(key,{at:Date.now(),data});return data}finally{clearTimeout(timeout);if(method==='GET')inflight.delete(key)}})();if(method==='GET')inflight.set(key,run);return run}
export function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
export function fmtDate(v){if(!v)return '—';try{return new Intl.DateTimeFormat('en-NG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Lagos'}).format(new Date(v))}catch{return String(v)}}
export function stateClass(v){const s=String(v||'').toUpperCase();return /READY|ONLINE|ACTIVE|HEALTHY|GO|VERIFIED|GRANTED|LIFTED/.test(s)?'good':/DEGRADED|ERROR|FAILED|BLOCKED|HOLD|REJECTED/.test(s)?'bad':'wait'}
