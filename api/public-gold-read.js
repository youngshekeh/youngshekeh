// Fixed-path Gold data read: avoids query-parameter ambiguity at auth/bypass gateways.
// Uses only existing approved read-only Supabase functions. No live trade API.
import {createFeedPressureGate,GOLD_FEED} from '../src/public-feed-pressure.mjs';
import {curatePublicGold} from '../src/public-gold-curation.mjs';
const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/';
async function publicRead(slug,ms){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 try{
   const response=await fetch(BASE+slug,{method:'GET',
     headers:{Accept:'application/json','User-Agent':'TFA-V228-GOLD-READ-ONLY/1.0'},
     redirect:'error',cache:'no-store',signal:controller.signal});
   if(!response.ok)return {httpOk:false,data:null};
   const body=await response.json().catch(()=>null);
   return {httpOk:true,data:body&&typeof body==='object'&&!Array.isArray(body)?body:null};
 }finally{clearTimeout(timer);}
}
const feed=createFeedPressureGate({async read(){
 let broker={httpOk:false,data:null},reference={httpOk:false,data:null};
 try{broker=await publicRead('public-gold-live-xauusd',11500);}catch{}
 // If already fresh broker-live, no second request is needed.
 let curated=curatePublicGold({broker});
 if(curated.ok)return curated;
 try{reference=await publicRead('public-gold-live-api',9500);}catch{}
 curated=curatePublicGold({broker,reference});
 if(!curated.ok)throw new Error('no_public_gold');
 return curated;
}});
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-TFA-Gold-Source','V228-FIXED-PUBLIC-READ');
 if(req.method!=='GET'){
   res.setHeader('Allow','GET');
   return res.status(405).json({ok:false,error:'method_not_allowed',
     governance:{action_permitted:'WAIT',capital_permission:'0R'}});
 }
 // No req.url, user parameters, tokens, cookies, or arbitrary target hosts
 // are ever sent upstream. Provider URL is a fixed, allowlisted slug.
 const result=await feed.observe(GOLD_FEED);
 res.setHeader('X-TFA-Gold-Pressure',result.mode);
 if(result.ok&&result.body?.ok===true)return res.status(200).json(result.body);
 return res.status(503).json({ok:false,state:'UNAVAILABLE',
   market_status:'UNAVAILABLE',error:'no_fresh_attributed_gold_quote',
   live_broker:{state:'NOT_VERIFIED'},feed:{},
   governance:{action_permitted:'WAIT',capital_permission:'0R',
     machine_execution_allowed:false,live_order_submission_enabled:false}});
}
