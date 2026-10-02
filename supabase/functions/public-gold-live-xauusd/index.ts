import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
const BASE="https://mpcelmjiycjpdyyflisn.supabase.co";
let cached:any=null,cachedAt=0,inflight:Promise<any>|null=null;
function serverKey(){const bundle=Deno.env.get("SUPABASE_SECRET_KEYS");if(bundle){try{const keys=JSON.parse(bundle);if(keys.default)return keys.default}catch{}}
 const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!key)throw new Error("server_key_unavailable");return key}
function n(v:any){const x=Number(v);return Number.isFinite(x)?x:null}
function round(v:any,d=3){const x=n(v);return x==null?null:Number(x.toFixed(d))}
function pct(a:any,b:any){const x=n(a),y=n(b);return x==null||y==null||y===0?null:(x-y)/y*100}
async function baseGold(){try{const r=await fetch(`${BASE}/functions/v1/public-gold-live-api`,{headers:{Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(10000)});const body=await r.json().catch(()=>null);return r.ok&&body?.ok?body:null}catch{return null}}
async function liveStatus(){const key=serverKey();const headers:any={apikey:key,Accept:"application/json","Content-Type":"application/json"};if(key.startsWith("ey"))headers.Authorization=`Bearer ${key}`;
 const r=await fetch(`${BASE}/rest/v1/rpc/get_v186_gold_live_market_status`,{method:"POST",headers,body:"{}",cache:"no-store",signal:AbortSignal.timeout(2500)});
 const body=await r.json().catch(()=>null);return r.ok&&body?.ok?body:null}
async function build(){
 const [base,live]=await Promise.all([baseGold(),liveStatus()]);
 const q=live?.quote||null;
 const liveFresh=live?.state==="BROKER_LIVE"&&q&&Number(q.age_seconds)<3;
 if(!base&&!liveFresh)return{ok:true,version:"v186-public-live-xauusd-v1",generated_at:new Date().toISOString(),market_status:"UNAVAILABLE",
   live_broker:live||{ok:false,state:"UNAVAILABLE"},display:{primary_gold_key:"gold_spot",spot_available:false},
   engine:{state:"DATA_GATED",action:"WAIT",capital_permission:"0R",confidence_pct:0,stale_data:true,delayed_feed:true,
     broker_quote_fresh:false,machine_execution_allowed:false},feed:{},methodology:{execution_notice:"No live or governed fallback quote is available. WAIT / 0R."}};
 if(!base)return{ok:true,version:"v186-public-live-xauusd-v1",generated_at:new Date().toISOString(),market_status:"BROKER_LIVE",
   live_broker:live,display:{primary_gold_key:"gold_spot",spot_available:true,futures_spot_basis_usd:null,live_broker_active:true},
   engine:{state:"LIVE_PRICE_ONLY_CONTEXT_GATED",action:"WAIT",capital_permission:"0R",confidence_pct:0,stale_data:false,delayed_feed:false,
     broker_quote_fresh:true,broker_quote_age_seconds:q.age_seconds,broker_trade_mode:q.trade_mode,broker_real_account_quote:q.real_account_quote,
     manual_execution_reference:q.real_account_quote===true,machine_execution_allowed:false},
   feed:{gold_spot:{symbol:"XAUUSD",name:"Gold Spot / USD",currency:"USD",price:q.mid,bid:q.bid,ask:q.ask,spread_usd:q.spread_usd,
     market_time:q.observed_at,exchange:"MT5 broker terminal",instrument_type:"SPOT",source:"Owner-enrolled MT5 read-only broker feed",quote_type:"broker_live_read_only"}},
   methodology:{market_data:"Live broker tick is read-only. No order route exists.",execution_notice:"Live price does not grant capital permission."}};
 const out=structuredClone(base),baseSpot=out?.feed?.gold_spot||{},futures=out?.feed?.gold_futures||out?.feed?.gold||{};
 out.version="v186-public-live-xauusd-v1";
 out.generated_at=new Date().toISOString();
 out.live_broker=live;
 out.display={...(out.display||{}),live_broker_active:!!liveFresh,live_broker_state:live?.state||"UNAVAILABLE"};
 if(liveFresh){
   const previous=n(baseSpot.previous_close??futures.previous_close);
   const brokerSpot={symbol:"XAUUSD",name:"Gold Spot / USD",currency:"USD",price:q.mid,bid:q.bid,ask:q.ask,spread_usd:q.spread_usd,
     spread_ticks:q.spread_ticks,previous_close:previous,change_pct:round(pct(q.mid,previous),3),
     day_high:baseSpot.day_high??null,day_low:baseSpot.day_low??null,market_time:q.observed_at,
     exchange:"MT5 broker terminal",instrument_type:"SPOT",source:"Owner-enrolled MT5 read-only broker feed",quote_type:"broker_live_read_only",
     trade_mode:q.trade_mode,real_account_quote:q.real_account_quote};
   out.feed={...(out.feed||{}),gold_spot:brokerSpot};
   out.display={...(out.display||{}),primary_gold_key:"gold_spot",spot_available:true,
     futures_spot_basis_usd:n(futures.price)!=null?round(Number(futures.price)-Number(q.mid),3):null};
   out.market_status="BROKER_LIVE";
   out.engine={...(out.engine||{}),broker_price_delayed:false,broker_quote_fresh:true,
     broker_quote_age_seconds:q.age_seconds,broker_trade_mode:q.trade_mode,broker_real_account_quote:q.real_account_quote,
     broker_bid:q.bid,broker_ask:q.ask,broker_spread_usd:q.spread_usd,broker_tick_count_60s:live?.quality?.tick_count_60s??0,
     manual_execution_reference:q.real_account_quote===true,machine_execution_allowed:false,capital_permission:"0R"};
 }
 out.methodology={...(out.methodology||{}),live_price_policy:"Fresh owner-enrolled MT5 broker ticks replace only the current XAUUSD display price. Existing COMEX-calibrated structural history is not rewritten.",
   execution_notice:"Live broker price is read-only market data. Machine execution remains disabled and capital permission remains 0R."};
 return out;
}
async function current(){if(cached&&Date.now()-cachedAt<750)return cached;if(inflight)return inflight;inflight=build().then(x=>{cached=x;cachedAt=Date.now();return x}).finally(()=>{inflight=null});return inflight}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});if(req.method!=="GET")return Response.json({ok:false,error:"method_not_allowed"},{status:405,headers:CORS});
 try{return Response.json(await current(),{headers:{...CORS,"Cache-Control":"public, max-age=0, s-maxage=1, stale-while-revalidate=2","X-TFA-Engine":"V186-LIVE-XAUUSD"}})}
 catch(error){console.error(error);return Response.json({ok:true,version:"v186-public-live-xauusd-v1",generated_at:new Date().toISOString(),market_status:"UNAVAILABLE",
  engine:{state:"DATA_GATED",action:"WAIT",capital_permission:"0R",machine_execution_allowed:false},feed:{},live_broker:{state:"UNAVAILABLE"},
  methodology:{execution_notice:"Live price unavailable. WAIT / 0R."}},{status:200,headers:{...CORS,"Cache-Control":"no-store"}})}
});