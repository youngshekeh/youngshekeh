import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPA=Deno.env.get("SUPABASE_URL")!;
const VERSION="v193-owner-gold-alert-inbox-v1";
const ACTIONS=new Set(["ACKNOWLEDGED","SNOOZED","CLOSED"]);

function serverKey(){
  const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(bundle){try{const p=JSON.parse(bundle);if(p?.default)return p.default}catch{}}
  const k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!k)throw new Error("server_key_unavailable");
  return k;
}
function cors(origin:string|null){
  const allowed=new Set([
    "https://thefatheranalytics.com",
    "https://www.thefatheranalytics.com",
    "https://the-father-analytics.vercel.app",
    "https://the-father-analytics-the-father.vercel.app",
    "https://mpcelmjiycjpdyyflisn.supabase.co"
  ]);
  const o=origin&&allowed.has(origin)?origin:"https://thefatheranalytics.com";
  return {
    "Access-Control-Allow-Origin":o,"Vary":"Origin",
    "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Content-Type":"application/json","Cache-Control":"no-store"
  };
}
function decodePayload(token:string){
  try{
    const p=token.split(".")[1],s=p.replace(/-/g,"+").replace(/_/g,"/"),pad=s+"=".repeat((4-s.length%4)%4);
    return JSON.parse(atob(pad));
  }catch{return {}}
}
async function jsonFetch(url:string,init:RequestInit={}){
  const r=await fetch(url,{...init,signal:AbortSignal.timeout(12000),cache:"no-store"});
  const text=await r.text();let data:any={};
  try{data=text?JSON.parse(text):{}}catch{data={message:text}}
  return{r,data};
}
async function getUser(token:string,service:string){
  const {r,data}=await jsonFetch(`${SUPA}/auth/v1/user`,{headers:{apikey:service,Authorization:`Bearer ${token}`,Accept:"application/json"}});
  return r.ok?data:null;
}
async function restRows(service:string,table:string,params:Record<string,string>){
  const u=new URL(`${SUPA}/rest/v1/${table}`);for(const[k,v]of Object.entries(params))u.searchParams.set(k,v);
  const {r,data}=await jsonFetch(u.toString(),{headers:{apikey:service,Authorization:`Bearer ${service}`,Accept:"application/json"}});
  if(!r.ok)throw new Error(`${table}_${r.status}`);return Array.isArray(data)?data:[];
}
async function rpc(service:string,name:string,args:any){
  const {r,data}=await jsonFetch(`${SUPA}/rest/v1/rpc/${name}`,{
    method:"POST",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(args)
  });
  if(!r.ok)throw new Error(`${name}_${r.status}`);return data;
}
Deno.serve(async(req:Request)=>{
  const headers=cors(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"method_not_allowed"}),{status:405,headers});
  try{
    const auth=req.headers.get("authorization")||"",token=auth.replace(/^Bearer\s+/i,"").trim();
    if(!token)return new Response(JSON.stringify({ok:false,error:"missing_token"}),{status:401,headers});
    const service=serverKey(),user=await getUser(token,service);
    if(!user?.id)return new Response(JSON.stringify({ok:false,error:"invalid_session"}),{status:401,headers});
    const owners=await restRows(service,"owner_users",{select:"role,active",user_id:`eq.${user.id}`,active:"eq.true",limit:"1"});
    if(!owners?.[0])return new Response(JSON.stringify({ok:false,error:"owner_only"}),{status:403,headers});
    const jwt=decodePayload(token);
    if(jwt?.aal!=="aal2")return new Response(JSON.stringify({ok:false,error:"aal2_required",aal:jwt?.aal||"aal1",
      governance:{owner_only:true,aal2_required:true,acknowledgement_is_not_trade_approval:true,capital_permission:"0R"}}),{status:403,headers});

    const input=await req.json().catch(()=>({})),action=String(input?.action||"inbox");
    if(action==="inbox"){
      const inbox=await rpc(service,"get_v193_gold_alert_inbox",{p_owner_user_id:user.id,p_limit:50});
      return new Response(JSON.stringify({...inbox,owner_role:owners[0].role,aal:"aal2"}),{headers});
    }

    if(action==="record"){
      const routeId=Number(input?.alert_route_id),decision=String(input?.decision||"").toUpperCase();
      if(!Number.isInteger(routeId)||routeId<=0)return new Response(JSON.stringify({ok:false,error:"invalid_alert_route_id"}),{status:400,headers});
      if(!ACTIONS.has(decision))return new Response(JSON.stringify({ok:false,error:"invalid_decision"}),{status:400,headers});
      const note=String(input?.note||"").trim().slice(0,500);
      const snooze=decision==="SNOOZED"
        ? new Date(Date.now()+Math.min(24*60,Math.max(5,Number(input?.snooze_minutes)||15))*60_000).toISOString()
        : null;
      const result=await rpc(service,"record_v193_gold_alert_action",{
        p_alert_route_id:routeId,p_owner_user_id:user.id,p_action:decision,p_snooze_until:snooze,p_note:note||null
      });
      return new Response(JSON.stringify({...result,governance:{
        owner_only:true,aal2_required:true,actions_append_only:true,
        acknowledgement_is_not_trade_approval:true,action_permitted:"WAIT",capital_permission:"0R",
        automatic_execution:false,live_order_submission_enabled:false
      }}),{status:result?.ok===true?200:409,headers});
    }

    return new Response(JSON.stringify({ok:false,error:"unknown_action"}),{status:400,headers});
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:"owner_alert_inbox_unavailable",detail:String((e as any)?.message||e).slice(0,160),
      governance:{action_permitted:"WAIT",capital_permission:"0R"}}),{status:503,headers});
  }
});