import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WATCH='https://thefatheranalytics.com/api/gold-trigger-watch-v189';
const VERSION='v191.1-gold-signal-event-capture-fail-fast';

function serverKey(){
  const bundle=Deno.env.get('SUPABASE_SECRET_KEYS');
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const legacy=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!legacy)throw new Error('server_key_unavailable');
  return legacy;
}
async function sha256Hex(input:string){
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function restRows(base:string,key:string,path:string){
  const r=await fetch(base+'/rest/v1/'+path,{headers:{apikey:key,Authorization:`Bearer ${key}`,Accept:'application/json'},signal:AbortSignal.timeout(2500)});
  if(!r.ok)throw new Error('rest_'+r.status);
  const j=await r.json();return Array.isArray(j)?j:[];
}
async function rpc(base:string,key:string,event:any){
  const r=await fetch(base+'/rest/v1/rpc/capture_v191_gold_signal_event',{
    method:'POST',
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({p_event:event}),
    signal:AbortSignal.timeout(2500)
  });
  if(!r.ok)throw new Error('capture_rpc_'+r.status);
  return r.json();
}
function bools(req:any){
  const x=req||{};
  return [
    `signal_day=${x.signal_day_confirmed===true}`,
    `signal_time=${x.signal_time_active===true}`,
    `live=${x.fresh_broker_xauusd===true}`,
    `transition=${x.liquidity_transition_resolved===true}`
  ].join(';');
}
function common(w:any){
  return{
    source_version:String(w?.version||'v189-gold-trigger-watch-v1'),
    lifecycle_stage:String(w?.context?.lifecycle_stage||'UNKNOWN'),
    signal_day:String(w?.context?.signal_day||'UNKNOWN'),
    signal_time:String(w?.context?.signal_time||'UNKNOWN'),
    direction_candidate:String(w?.context?.direction_candidate||'NEUTRAL'),
    anchor_state:String(w?.anchor?.state||'UNAVAILABLE'),
    anchor_price:Number.isFinite(Number(w?.anchor?.price))?Number(w.anchor.price):null,
    review_gate_ready:w?.review_gate?.ready===true,
    action_permitted:'WAIT',
    capital_permission:'0R',
    automatic_execution:false,
    live_order_submission_enabled:false
  };
}
function events(w:any){
  const c=common(w),out:any[]=[];
  out.push({...c,event_key:'WATCH_STATE',event_state:String(w?.state||'UNKNOWN'),condition:String(w?.decision_compression?.what_matters||'')});
  out.push({...c,event_key:'SIGNAL_DAY',event_state:String(w?.context?.signal_day||'UNKNOWN'),condition:`score=${w?.context?.signal_day_score??'n/a'}`});
  out.push({...c,event_key:'SIGNAL_TIME',event_state:String(w?.context?.signal_time||'UNKNOWN'),condition:String(w?.context?.direction_candidate||'NEUTRAL')});
  out.push({...c,event_key:'LIFECYCLE_STAGE',event_state:String(w?.context?.lifecycle_stage||'UNKNOWN'),condition:`${w?.context?.liquidity_phase||'UNKNOWN'}|${w?.context?.acceptance||'UNKNOWN'}`});
  out.push({...c,event_key:'REVIEW_GATE',event_state:w?.review_gate?.ready===true?'READY':'LOCKED',condition:bools(w?.review_gate?.requirements)});
  const next=w?.next_signal_window?.next;
  if(next){
    out.push({...c,event_key:'NEXT_SIGNAL_WINDOW',event_state:String(next.phase||'UNKNOWN'),
      condition:`${next.key||'UNKNOWN'}|${next.start_at||'ACTIVE'}`,
      next_window_key:next.key??null,next_window_start_at:next.start_at??null});
  }
  for(const t of Array.isArray(w?.triggers)?w.triggers:[]){
    const id=String(t?.id||'').toUpperCase().replace(/[^A-Z0-9_-]/g,'_').slice(0,64);
    if(!id)continue;
    out.push({...c,event_key:`TRIGGER:${id}`,event_state:String(t?.state||'UNKNOWN'),
      trigger_id:id,condition:String(t?.condition||''),live_required:t?.live_required===true,satisfied:t?.satisfied===true});
  }
  return out;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  try{
    const base=Deno.env.get('SUPABASE_URL')||'https://mpcelmjiycjpdyyflisn.supabase.co';
    const key=serverKey();
    const supplied=req.headers.get('x-tfa-cron-secret')||'';
    if(!supplied)return Response.json({ok:false,error:'unauthorized'},{status:401});
    const token=await restRows(base,key,'runtime_tokens?select=token_hash&name=eq.ingestion_cron&active=eq.true&limit=1');
    if(!token?.[0]?.token_hash||token[0].token_hash!==await sha256Hex(supplied))
      return Response.json({ok:false,error:'unauthorized'},{status:401});

    const upstream=await fetch(WATCH,{headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-V191/1.0'},cache:'no-store',signal:AbortSignal.timeout(4000)});
    const watch=await upstream.json().catch(()=>null);
    if(!upstream.ok||watch?.ok!==true)
      return Response.json({ok:false,version:VERSION,state:'WATCH_UNAVAILABLE',capital_permission:'0R'},{status:503,headers:{'Cache-Control':'no-store'}});

    const results=[];
    for(const event of events(watch)){
      results.push(await rpc(base,key,event));
    }
    const inserted=results.filter((x:any)=>x?.inserted===true).length;
    return Response.json({
      ok:true,version:VERSION,state:inserted?'EVENTS_RECORDED':'NO_MATERIAL_CHANGE',
      observed_watch_state:watch.state,
      attempted:results.length,inserted,unchanged:results.length-inserted,
      event_ids:results.filter((x:any)=>x?.inserted===true).map((x:any)=>x.event_id),
      governance:{append_only:true,action_permitted:'WAIT',capital_permission:'0R',automatic_execution:false,live_order_submission_enabled:false}
    },{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error(error);
    return Response.json({ok:false,version:VERSION,state:'CAPTURE_FAILED',capital_permission:'0R'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
});