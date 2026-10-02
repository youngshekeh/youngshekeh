import {createQaTransport} from './transport.mjs';

const TFA_PRIVATE_AUTHZ='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v115-oidc-probe';

function tfaConstantTimeEqual(a:string,b:string){
  if(!a||!b||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function tfaPrivateAuthorized(req:Request){
  const auth=req.headers.get('authorization')||'';
  const token=auth.toLowerCase().startsWith('bearer ')?auth.slice(7).trim():'';
  if(!token)return false;

  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(serviceRole&&tfaConstantTimeEqual(token,serviceRole))return true;

  try{
    const r=await fetch(TFA_PRIVATE_AUTHZ,{
      headers:{Authorization:auth,Accept:'application/json'},
      signal:AbortSignal.timeout(5000)
    });
    const body=await r.json().catch(()=>null);
    return r.ok&&body?.ok===true&&body?.state==='VERCEL_WORKLOAD_VERIFIED';
  }catch{return false}
}

const VERSION='v196.0-live-feed-quality-certification-v61';
const BASE='https://thefatheranalytics.com';
const PRIVATE_LOCK_PROBE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/runtime-v75-day-state';

function result(name,pass,detail,latency_ms){return {name,pass:!!pass,detail,latency_ms}}
function positive(v){const n=Number(v);return Number.isFinite(n)&&n>0}
async function legacyHandler(req:any,res:any,transport:any){
  const fetchAny=(path:string,timeout=10000)=>transport.any(BASE+path,timeout);
  const fetchAbsolute=(url:string,timeout=10000)=>transport.json(url,timeout);
  const fetchAbsolutePost=(url:string,body:any,timeout=10000)=>transport.post(url,body,timeout);
  const tfaRetry=(task:()=>Promise<any>,delay=250)=>transport.retry(task,delay);
  async function tfaBoundedAll(tasks:Array<()=>Promise<any>>,concurrency=3){return transport.all(tasks,concurrency);}
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'method_not_allowed'})}
  const [home,capitalSurface,gold,ownerSurface,ownerReviewAnon,ownerAlertAnon,privateAnon,paperFeedAnon,paperFeed,mission,productionClosure,opportunityGovernor,capitalCalendar,earningsCalendar,desk,learning,outcome,transition,trigger,reputation,reviewIntel,disagreementIntel,contextIntel,priorityIntel,freshnessIntel,shadowTrader,shadowPortfolio,executionReality,brokerLab,auto,day,quality,selftest,tournament,shadow,quota,v79,v81,v82,v83,v83self,v186live,v187signal,v188session,v188lifecycle,v189watch,v191ledger,v192router,v194command,v195bridge,v196quality]=await tfaBoundedAll([
    ()=>fetchAny('/'),
    ()=>fetchAny('/capital-os/'),
    ()=>fetchAny('/gold-live/'),
    ()=>fetchAny('/owner/'),
    ()=>fetchAbsolutePost('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/owner-gold-review-actions',{action:'queue'},8000),
    ()=>fetchAbsolutePost('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/owner-gold-alert-actions',{action:'inbox'},8000),
    ()=>tfaRetry(()=>fetchAbsolute(PRIVATE_LOCK_PROBE)),
    ()=>fetchAbsolutePost('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/paper-broker-quote-intake',{},8000),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/paper-broker-quote-intake',8000)),
    ()=>fetchAny(`/api/mission-brief?qa_fresh=${Date.now()}`,15000),
    ()=>fetchAny('/api/production-closure',7000),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-opportunity-governor',10000)),
    ()=>fetchAny('/api/capital-calendar',12000),
    ()=>fetchAny('/api/earnings-calendar',12000),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-execution-desk',12000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-learning-state',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-outcome-learning',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-transition-state',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-trigger-watch',12000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-signal-reputation',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-review-intelligence',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-disagreement-intelligence',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-contextual-disagreement',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-review-priority',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-review-freshness',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-autonomous-shadow-trader',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-shadow-portfolio-brain',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-execution-reality',8000)),
    ()=>tfaRetry(()=>fetchAbsolute('https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1/public-gold-broker-adapter-lab',8000)),
    ()=>fetchAny('/api/autonomous-state'),
    ()=>fetchAny('/api/gold-day-state'),
    ()=>fetchAny('/api/data-quality-sentinel'),
    ()=>fetchAny('/api/data-quality-sentinel?selftest=1'),
    ()=>fetchAny('/api/research-model-tournament'),
    ()=>fetchAny('/api/shadow-market-snapshot'),
    ()=>fetchAny('/api/quota-probe'),
    ()=>fetchAny('/api/gold-liquidity-state-machine'),
    ()=>fetchAny('/api/gold-mtf-zones'),
    ()=>fetchAny('/api/gold-mtf-confluence'),
    ()=>fetchAny('/api/gold-breakout-acceptance'),
    ()=>fetchAny('/api/gold-breakout-acceptance?selftest=1'),
    ()=>fetchAny('/api/gold-live-price',6000),
    ()=>fetchAny('/api/gold-signal-map',12000),
    ()=>fetchAny('/api/gold-session-liquidity',10000),
    ()=>fetchAny('/api/gold-signal-lifecycle',15000),
    ()=>fetchAny('/api/gold-trigger-watch-v189',15000),
    ()=>fetchAny('/api/gold-event-ledger-v191',10000),
    ()=>fetchAny('/api/gold-alert-router-v192',10000),
    ()=>fetchAny('/api/gold-command-v194',12000),
    ()=>fetchAny('/api/gold-bridge-readiness-v195',10000),
    ()=>fetchAny('/api/gold-feed-quality-v196',10000)
  ],3);
  const tests=[];

  tests.push(result('v167_capital_os_surface_contract',
    capitalSurface.status===200
      &&typeof capitalSurface.body==='string'
      &&capitalSurface.body.includes('PORTFOLIO MANAGER')
      &&capitalSurface.body.includes('ASSET ALLOCATOR')
      &&capitalSurface.body.includes('ECONOMIC CALENDAR')
      &&capitalSurface.body.includes('id="journal-form"')
      &&capitalSurface.body.includes('id="portfolio-form"'),
    `status=${capitalSurface.status}, journal=${typeof capitalSurface.body==='string'&&capitalSurface.body.includes('id="journal-form"')?'present':'missing'}, portfolio=${typeof capitalSurface.body==='string'&&capitalSurface.body.includes('id="portfolio-form"')?'present':'missing'}`,
    capitalSurface.latency_ms));
  tests.push(result('v167_official_macro_calendar_contract',
    capitalCalendar.status===200
      &&capitalCalendar.body?.ok===true
      &&Array.isArray(capitalCalendar.body?.events)
      &&capitalCalendar.body.events.length>=1
      &&['LIVE_OFFICIAL_SCHEDULES','OFFICIAL_STATIC_FALLBACK_ACTIVE'].includes(String(capitalCalendar.body?.state||''))
      &&capitalCalendar.body?.governance?.trading_permission===false
      &&capitalCalendar.body?.governance?.event_proximity_is_context_only===true,
    `status=${capitalCalendar.status}, state=${capitalCalendar.body?.state}, events=${capitalCalendar.body?.events?.length ?? 0}, trading=${capitalCalendar.body?.governance?.trading_permission}`,
    capitalCalendar.latency_ms));
  tests.push(result('v167_earnings_truth_contract',
    earningsCalendar.status===200
      &&(
        (earningsCalendar.body?.ok===true
          &&earningsCalendar.body?.state==='LIVE_UPSTREAM'
          &&Array.isArray(earningsCalendar.body?.rows)
          &&earningsCalendar.body?.governance?.no_estimates_fabricated===true
          &&earningsCalendar.body?.governance?.trading_permission===false)
        ||
        (earningsCalendar.body?.ok===false
          &&earningsCalendar.body?.state==='UPSTREAM_UNAVAILABLE'
          &&Array.isArray(earningsCalendar.body?.rows)
          &&earningsCalendar.body.rows.length===0)
      ),
    `status=${earningsCalendar.status}, state=${earningsCalendar.body?.state}, rows=${earningsCalendar.body?.rows?.length ?? 0}`,
    earningsCalendar.latency_ms));
  tests.push(result('v166_production_closure_contract',
    productionClosure.status===200
      &&productionClosure.body?.ok===true
      &&productionClosure.body?.closure?.platform_research_ready===true
      &&productionClosure.body?.closure?.autonomous_paper_ready===true
      &&productionClosure.body?.closure?.live_execution_ready===false
      &&productionClosure.body?.governance?.action_permitted==='WAIT'
      &&productionClosure.body?.governance?.capital_permission==='0R'
      &&productionClosure.body?.governance?.order_submission_enabled===false
      &&productionClosure.body?.governance?.automatic_real_capital===false,
    `status=${productionClosure.status}, state=${productionClosure.body?.state}, research=${productionClosure.body?.closure?.platform_research_ready}, paper=${productionClosure.body?.closure?.autonomous_paper_ready}, live=${productionClosure.body?.closure?.live_execution_ready}, capital=${productionClosure.body?.governance?.capital_permission}`,
    productionClosure.latency_ms));
  tests.push(result('homepage_http',home.status===200,`status=${home.status}`,home.latency_ms));
  tests.push(result('gold_surface_http',gold.status===200,`status=${gold.status}`,gold.latency_ms));
  tests.push(result('v126_owner_review_surface_contract',
    ownerSurface.status===200
      &&typeof ownerSurface.body==='string'
      &&ownerSurface.body.includes('V126 · HUMAN REVIEW INBOX')
      &&ownerSurface.body.includes('id="reviewInbox"')
      &&ownerSurface.body.includes('id="reviewPending"')
      &&ownerSurface.body.includes('id="reviewReviewed"')
      &&ownerSurface.body.includes('id="reviewDirectional"')
      &&ownerSurface.body.includes('id="reviewQueue"')
      &&ownerSurface.body.includes('id="reviewInbox" class="card status-box hidden"'),
    `status=${ownerSurface.status}, inbox=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('V126 · HUMAN REVIEW INBOX')?'present':'missing'}, default_hidden=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('id="reviewInbox" class="card status-box hidden"')}`,
    ownerSurface.latency_ms));
  tests.push(result('v127_owner_review_intelligence_surface_contract',
    ownerSurface.status===200
      &&typeof ownerSurface.body==='string'
      &&ownerSurface.body.includes('V127 · REVIEW INTELLIGENCE')
      &&ownerSurface.body.includes('id="reviewIntelligence"')
      &&ownerSurface.body.includes('id="reviewIntelState"')
      &&ownerSurface.body.includes('id="reviewIntelAnchors"')
      &&ownerSurface.body.includes('id="reviewIntelOutcomes"')
      &&ownerSurface.body.includes('id="reviewIntelSample"')
      &&ownerSurface.body.includes('id="reviewIntelCapital"')
      &&ownerSurface.body.includes('id="reviewIntelligence" class="card status-box hidden"'),
    `status=${ownerSurface.status}, review_intelligence=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('V127 · REVIEW INTELLIGENCE')?'present':'missing'}, default_hidden=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('id="reviewIntelligence" class="card status-box hidden"')}`,
    ownerSurface.latency_ms));
  tests.push(result('v130_owner_priority_surface_contract',
    ownerSurface.status===200
      &&typeof ownerSurface.body==='string'
      &&ownerSurface.body.includes('id="reviewP1"')
      &&ownerSurface.body.includes('P1 HIGH ATTENTION')
      &&ownerSurface.body.includes('id="reviewInbox" class="card status-box hidden"'),
    `status=${ownerSurface.status}, p1_counter=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('id="reviewP1"')?'present':'missing'}, inbox_default_hidden=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('id="reviewInbox" class="card status-box hidden"')}`,
    ownerSurface.latency_ms));
  tests.push(result('v118_broker_xau_bridge_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V118 · BROKER XAUUSD BRIDGE')
      &&gold.body.includes('v118-broker-bid')
      &&gold.body.includes('v118-broker-ask')
      &&gold.body.includes('v118-translate'),
    `status=${gold.status}, bridge=${typeof gold.body==='string'&&gold.body.includes('V118 · BROKER XAUUSD BRIDGE')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v121_live_pulse_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V121 · LIVE PULSE')
      &&gold.body.includes('v121-refresh-now')
      &&gold.body.includes('v121-broker-age')
      &&gold.body.includes('v121-pulse-mode'),
    `status=${gold.status}, pulse=${typeof gold.body==='string'&&gold.body.includes('V121 · LIVE PULSE')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v122_outcome_lab_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V122 · FORWARD OUTCOME LAB')
      &&gold.body.includes('v122-resolved')
      &&gold.body.includes('v122-15m')
      &&gold.body.includes('v122-edge'),
    `status=${gold.status}, outcome_lab=${typeof gold.body==='string'&&gold.body.includes('V122 · FORWARD OUTCOME LAB')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v123_what_changed_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V123 · WHAT CHANGED?')
      &&gold.body.includes('v123-change-state')
      &&gold.body.includes('v123-event')
      &&gold.body.includes('v123-data')
      &&gold.body.includes('v123-capital'),
    `status=${gold.status}, what_changed=${typeof gold.body==='string'&&gold.body.includes('V123 · WHAT CHANGED?')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v124_trigger_watch_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V124 · TRIGGER WATCH')
      &&gold.body.includes('v124-trigger-state')
      &&gold.body.includes('v124-long-distance')
      &&gold.body.includes('v124-short-distance')
      &&gold.body.includes('v124-broker-long-distance')
      &&gold.body.includes('v124-broker-short-distance'),
    `status=${gold.status}, trigger_watch=${typeof gold.body==='string'&&gold.body.includes('V124 · TRIGGER WATCH')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v125_signal_reputation_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V125 · SIGNAL REPUTATION')
      &&gold.body.includes('v125-reputation-state')
      &&gold.body.includes('v125-trigger-count')
      &&gold.body.includes('v125-directional-count')
      &&gold.body.includes('v125-human-count')
      &&gold.body.includes('v125-sample-count')
      &&gold.body.includes('v125-public-stats')
      &&gold.body.includes('v125-capital'),
    `status=${gold.status}, signal_reputation=${typeof gold.body==='string'&&gold.body.includes('V125 · SIGNAL REPUTATION')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v127_review_intelligence_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V127 · REVIEW INTELLIGENCE')
      &&gold.body.includes('v127-review-state')
      &&gold.body.includes('v127-reviews')
      &&gold.body.includes('v127-anchors')
      &&gold.body.includes('v127-outcomes')
      &&gold.body.includes('v127-sample')
      &&gold.body.includes('v127-public-stats')
      &&gold.body.includes('v127-capital'),
    `status=${gold.status}, review_intelligence=${typeof gold.body==='string'&&gold.body.includes('V127 · REVIEW INTELLIGENCE')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v128_disagreement_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V128 · HUMAN × MACHINE')
      &&gold.body.includes('v128-disagreement-state')
      &&gold.body.includes('v128-reviews')
      &&gold.body.includes('v128-outcomes')
      &&gold.body.includes('v128-events')
      &&gold.body.includes('v128-sample')
      &&gold.body.includes('v128-15m')
      &&gold.body.includes('v128-30m')
      &&gold.body.includes('v128-override')
      &&gold.body.includes('v128-capital'),
    `status=${gold.status}, disagreement_surface=${typeof gold.body==='string'&&gold.body.includes('V128 · HUMAN × MACHINE')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v129_context_lab_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V129 · CONTEXT LAB')
      &&gold.body.includes('v129-context-state')
      &&gold.body.includes('v129-events')
      &&gold.body.includes('v129-scorable')
      &&gold.body.includes('v129-cohorts')
      &&gold.body.includes('v129-sample')
      &&gold.body.includes('v129-session')
      &&gold.body.includes('v129-structure')
      &&gold.body.includes('v129-signal')
      &&gold.body.includes('v129-capital'),
    `status=${gold.status}, context_lab=${typeof gold.body==='string'&&gold.body.includes('V129 · CONTEXT LAB')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v130_review_routing_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V130 · REVIEW ROUTING')
      &&gold.body.includes('v130-priority-state')
      &&gold.body.includes('v130-assignments')
      &&gold.body.includes('v130-pending')
      &&gold.body.includes('v130-p1')
      &&gold.body.includes('v130-top-score')
      &&gold.body.includes('v130-p1-band')
      &&gold.body.includes('v130-p2-band')
      &&gold.body.includes('v130-model')
      &&gold.body.includes('v130-capital'),
    `status=${gold.status}, review_routing=${typeof gold.body==='string'&&gold.body.includes('V130 · REVIEW ROUTING')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v131_review_freshness_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V131 · REVIEW FRESHNESS')
      &&gold.body.includes('v131-freshness-state')
      &&gold.body.includes('v131-pending')
      &&gold.body.includes('v131-over')
      &&gold.body.includes('v131-p1-over')
      &&gold.body.includes('v131-oldest-p1')
      &&gold.body.includes('v131-p1-target')
      &&gold.body.includes('v131-p2-target')
      &&gold.body.includes('v131-latency')
      &&gold.body.includes('v131-capital'),
    `status=${gold.status}, review_freshness=${typeof gold.body==='string'&&gold.body.includes('V131 · REVIEW FRESHNESS')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v132_shadow_execution_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V132 · AUTONOMOUS SHADOW EXECUTION')
      &&gold.body.includes('id="v132-shadow-cockpit"')
      &&gold.body.includes('v132-state')
      &&gold.body.includes('v132-intents')
      &&gold.body.includes('v132-open')
      &&gold.body.includes('v132-resolved')
      &&gold.body.includes('v132-stats')
      &&gold.body.includes('v132-open-studies')
      &&gold.body.includes('v132-broker')
      &&gold.body.includes('v132-capital')
      &&gold.body.includes('SHADOW AUTONOMY · ON')
      &&gold.body.includes('LIVE ORDERS · OFF')
      &&gold.body.includes('REAL CAPITAL · 0R'),
    `status=${gold.status}, cockpit=${typeof gold.body==='string'&&gold.body.includes('V132 · AUTONOMOUS SHADOW EXECUTION')?'present':'missing'}, live_orders_off=${typeof gold.body==='string'&&gold.body.includes('LIVE ORDERS · OFF')}, capital_0r=${typeof gold.body==='string'&&gold.body.includes('REAL CAPITAL · 0R')}`,
    gold.latency_ms));
  tests.push(result('v1331_execution_reality_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V133.1 · EXECUTION REALITY')
      &&gold.body.includes('id="v133-execution-reality"')
      &&gold.body.includes('v133-reality-state')
      &&gold.body.includes('v133-sample')
      &&gold.body.includes('v133-blockers')
      &&gold.body.includes('v133-infra')
      &&gold.body.includes('v133-gates')
      &&gold.body.includes('v133-low')
      &&gold.body.includes('v133-mod')
      &&gold.body.includes('v133-high')
      &&gold.body.includes('v133-orders')
      &&gold.body.includes('v133-capital')
      &&gold.body.includes('BROKER · NOT CONNECTED')
      &&gold.body.includes('LIVE CAPITAL · 0R'),
    `status=${gold.status}, reality=${typeof gold.body==='string'&&gold.body.includes('V133.1 · EXECUTION REALITY')?'present':'missing'}, broker_locked=${typeof gold.body==='string'&&gold.body.includes('BROKER · NOT CONNECTED')}, capital_0r=${typeof gold.body==='string'&&gold.body.includes('LIVE CAPITAL · 0R')}`,
    gold.latency_ms));
  tests.push(result('v134_broker_adapter_lab_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V134 · BROKER ADAPTER LAB')
      &&gold.body.includes('id="v134-broker-adapter-lab"')
      &&gold.body.includes('v134-lab-state')
      &&gold.body.includes('v134-tests')
      &&gold.body.includes('v134-real-orders')
      &&gold.body.includes('v134-orphans')
      &&gold.body.includes('v134-tests-grid')
      &&gold.body.includes('v134-production')
      &&gold.body.includes('v134-orders')
      &&gold.body.includes('v134-capital')
      &&gold.body.includes('LIVE ROUTE · ABSENT')
      &&gold.body.includes('PRODUCTION BROKER · NOT TESTED')
      &&gold.body.includes('REAL CAPITAL · 0R'),
    `status=${gold.status}, lab=${typeof gold.body==='string'&&gold.body.includes('V134 · BROKER ADAPTER LAB')?'present':'missing'}, live_route_absent=${typeof gold.body==='string'&&gold.body.includes('LIVE ROUTE · ABSENT')}, production_not_tested=${typeof gold.body==='string'&&gold.body.includes('PRODUCTION BROKER · NOT TESTED')}, capital_0r=${typeof gold.body==='string'&&gold.body.includes('REAL CAPITAL · 0R')}`,
    gold.latency_ms));
  tests.push(result('v135_opportunity_governor_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V135 · AUTONOMOUS OPPORTUNITY GOVERNOR')
      &&gold.body.includes('id="v135-opportunity-governor"')
      &&gold.body.includes('v135-state')
      &&gold.body.includes('v135-paper-action')
      &&gold.body.includes('v135-slot')
      &&gold.body.includes('v135-prereq-grid')
      &&gold.body.includes('v135-live-action')
      &&gold.body.includes('v135-capital')
      &&gold.body.includes('PAPER AUTONOMY · ACTIVE')
      &&gold.body.includes('LIVE EXECUTION · LOCKED')
      &&gold.body.includes('REAL CAPITAL · 0R'),
    `status=${gold.status}, governor=${typeof gold.body==='string'&&gold.body.includes('V135 · AUTONOMOUS OPPORTUNITY GOVERNOR')?'present':'missing'}, paper=${typeof gold.body==='string'&&gold.body.includes('PAPER AUTONOMY · ACTIVE')}, live_locked=${typeof gold.body==='string'&&gold.body.includes('LIVE EXECUTION · LOCKED')}, capital_0r=${typeof gold.body==='string'&&gold.body.includes('REAL CAPITAL · 0R')}`,
    gold.latency_ms));
  tests.push(result('v120_gold_execution_desk',
    desk.status===200
      &&desk.body?.ok===true
      &&String(desk.body?.version||'').startsWith('v120-')
      &&desk.body?.governance?.no_automatic_orders===true
      &&desk.body?.governance?.research_sizing_separated_from_executable_permission===true
      &&desk.body?.execution?.research_sizing_is_not_capital_permission===true
      &&desk.body?.execution?.system_action==='WAIT'
      &&desk.body?.execution?.system_capital_permission==='0R'
      &&(desk.body?.market?.broker_execution_feed_required!==true||desk.body?.market?.execution_quote_allowed===false),
    `state=${desk.body?.desk_state}, feed=${desk.body?.market?.market_status}, broker_required=${desk.body?.market?.broker_execution_feed_required}, quote_allowed=${desk.body?.market?.execution_quote_allowed}`,
    desk.latency_ms));
  tests.push(result('v120_multi_session_clock',
    desk.status===200
      &&['LONDON_FRAMEWORK','NEW_YORK_COMEX','NONE'].includes(String(desk.body?.session?.primary_session||''))
      &&String(desk.body?.session?.opening_state||'UNKNOWN')!=='UNKNOWN'
      &&typeof desk.body?.session?.london_time==='string'
      &&typeof desk.body?.session?.new_york_time==='string',
    `primary=${desk.body?.session?.primary_session}, state=${desk.body?.session?.opening_state}, london=${desk.body?.session?.london_time}, ny=${desk.body?.session?.new_york_time}`,
    desk.latency_ms));
  tests.push(result('v119_prospective_learning_ledger',
    learning.status===200
      &&learning.body?.ok===true
      &&String(learning.body?.version||'').startsWith('v119-')
      &&Number(learning.body?.prospective_sample_count||0)>=1
      &&learning.body?.methodology?.prospective_only===true
      &&learning.body?.methodology?.append_only===true
      &&learning.body?.methodology?.outcomes_not_inferred===true,
    `samples=${learning.body?.prospective_sample_count}, health=${learning.body?.capture_health?.state}, latest=${learning.body?.latest?.desk_state}, performance=${learning.body?.methodology?.performance_claims}`,
    learning.latency_ms));
  tests.push(result('v122_forward_outcome_learning',
    outcome.status===200
      &&outcome.body?.ok===true
      &&String(outcome.body?.version||'').startsWith('v122-')
      &&Number(outcome.body?.resolved_outcome_count||0)>=1
      &&outcome.body?.methodology?.market_time_based===true
      &&outcome.body?.methodology?.intrabar_sequence_not_inferred===true
      &&outcome.body?.calibration?.trade_pnl_claimed===false
      &&outcome.body?.calibration?.edge_claims==='WITHHELD',
    `resolved=${outcome.body?.resolved_outcome_count}, eligible=${outcome.body?.trade_eligible_source_count}, edge=${outcome.body?.calibration?.edge_claims}`,
    outcome.latency_ms));
  tests.push(result('v123_transition_intelligence',
    transition.status===200
      &&transition.body?.ok===true
      &&String(transition.body?.version||'').startsWith('v123-')
      &&transition.body?.governance?.read_only===true
      &&transition.body?.governance?.append_only_source===true
      &&transition.body?.governance?.automatic_orders===false
      &&transition.body?.governance?.transition_cannot_promote_permission===true
      &&transition.body?.governance?.capital_permission==='0R'
      &&(
        transition.body?.data_quality?.blocked===false
        ||(
          transition.body?.data_quality?.blocked===true
          &&transition.body?.state==='DATA_BLOCKED'
          &&transition.body?.current?.action==='WAIT'
          &&transition.body?.current?.capital_permission==='0R'
        )
      ),
    `state=${transition.body?.state}, event=${transition.body?.latest_transition?.transition_code}, blocked=${transition.body?.data_quality?.blocked}, capital=${transition.body?.governance?.capital_permission}`,
    transition.latency_ms));
  tests.push(result('v124_trigger_watch',
    trigger.status===200
      &&trigger.body?.ok===true
      &&String(trigger.body?.version||'').startsWith('v124-')
      &&trigger.body?.governance?.read_only===true
      &&trigger.body?.governance?.no_automatic_orders===true
      &&trigger.body?.governance?.no_probability_claim===true
      &&trigger.body?.governance?.no_acceptance_inference===true
      &&trigger.body?.governance?.trigger_watch_cannot_promote_permission===true
      &&trigger.body?.governance?.capital_permission==='0R'
      &&trigger.body?.execution?.machine_executable===false,
    `state=${trigger.body?.state}, long=${trigger.body?.long_watch?.location}, short=${trigger.body?.short_watch?.location}, capital=${trigger.body?.governance?.capital_permission}`,
    trigger.latency_ms));
  tests.push(result('v125_signal_reputation',
    reputation.status===200
      &&reputation.body?.ok===true
      &&String(reputation.body?.version||'').startsWith('v125.3-')
      &&reputation.body?.classifier_version==='v125.3-event-aware-v2'
      &&reputation.body?.methodology?.classifier_version==='v125.3-event-aware-v2'
      &&reputation.body?.methodology?.event_aware_direction_classifier===true
      &&reputation.body?.methodology?.legacy_classifier_rows_excluded===true
      &&reputation.body?.methodology?.transition_linked_only===true
      &&reputation.body?.methodology?.repeated_snapshots_do_not_create_duplicate_triggers===true
      &&reputation.body?.methodology?.generic_breakout_direction_not_inferred===true
      &&reputation.body?.methodology?.tiny_sample_statistics_withheld===true
      &&reputation.body?.governance?.human_review_not_simulated===true
      &&reputation.body?.governance?.automatic_weighting===false
      &&reputation.body?.governance?.automatic_promotion===false
      &&reputation.body?.governance?.automatic_orders===false
      &&reputation.body?.governance?.capital_permission==='0R'
      &&Number(reputation.body?.pipeline?.trigger_review_requests||0)>=1,
    `state=${reputation.body?.state}, classifier=${reputation.body?.classifier_version}, triggers=${reputation.body?.pipeline?.trigger_review_requests}, directional=${reputation.body?.pipeline?.directional_review_candidates}, human=${reputation.body?.pipeline?.human_review_events}, max_n=${reputation.body?.pipeline?.max_sample_count}, capital=${reputation.body?.governance?.capital_permission}`,
    reputation.latency_ms));
  tests.push(result('v126_owner_review_anonymous_denial',
    ownerReviewAnon.status===401
      &&ownerReviewAnon.body?.error==='missing_token',
    `status=${ownerReviewAnon.status}, error=${ownerReviewAnon.body?.error}`,
    ownerReviewAnon.latency_ms));
  tests.push(result('v193_owner_alert_inbox_protected',
    ownerAlertAnon.status===401
      &&ownerAlertAnon.body?.error==='missing_token'
      &&ownerSurface.status===200
      &&typeof ownerSurface.body==='string'
      &&ownerSurface.body.includes('V193 · OWNER GOLD ALERT INBOX'),
    `anon_status=${ownerAlertAnon.status}, error=${ownerAlertAnon.body?.error}, surface=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('V193 · OWNER GOLD ALERT INBOX')?'present':'missing'}`,
    Math.max(ownerAlertAnon.latency_ms||0,ownerSurface.latency_ms||0)));
  tests.push(result('v127_review_intelligence',
    reviewIntel.status===200
      &&reviewIntel.body?.ok===true
      &&String(reviewIntel.body?.version||'').startsWith('v127-')
      &&reviewIntel.body?.classifier_version==='v125.3-event-aware-v2'
      &&reviewIntel.body?.methodology?.post_review_server_capture_anchor===true
      &&reviewIntel.body?.methodology?.future_windows_start_from_post_review_anchor===true
      &&reviewIntel.body?.methodology?.trade_pnl_claimed===false
      &&reviewIntel.body?.methodology?.intrabar_sequence_not_inferred===true
      &&reviewIntel.body?.methodology?.reviewer_identity_public===false
      &&reviewIntel.body?.methodology?.reviewer_notes_public===false
      &&reviewIntel.body?.governance?.automatic_weighting===false
      &&reviewIntel.body?.governance?.automatic_promotion===false
      &&reviewIntel.body?.governance?.automatic_orders===false
      &&reviewIntel.body?.governance?.human_review_can_grant_capital===false
      &&reviewIntel.body?.governance?.capital_permission==='0R',
    `state=${reviewIntel.body?.state}, reviews=${reviewIntel.body?.pipeline?.human_review_events}, anchors=${reviewIntel.body?.pipeline?.post_review_anchors}, outcomes=${reviewIntel.body?.pipeline?.resolved_review_outcomes}, max_n=${reviewIntel.body?.pipeline?.max_scorable_sample}, capital=${reviewIntel.body?.governance?.capital_permission}`,
    reviewIntel.latency_ms));
  tests.push(result('v128_disagreement_intelligence',
    disagreementIntel.status===200
      &&disagreementIntel.body?.ok===true
      &&String(disagreementIntel.body?.version||'').startsWith('v128-')
      &&disagreementIntel.body?.classifier_version==='v125.3-event-aware-v2'
      &&disagreementIntel.body?.methodology?.derived_only_from_resolved_v127_post_review_outcomes===true
      &&disagreementIntel.body?.methodology?.disagreement_requires_explicit_human_contradiction===true
      &&disagreementIntel.body?.methodology?.supportive_review_is_agreement_not_independent_prediction===true
      &&disagreementIntel.body?.methodology?.trade_pnl_claimed===false
      &&disagreementIntel.body?.methodology?.intrabar_sequence_not_inferred===true
      &&disagreementIntel.body?.governance?.automatic_human_override===false
      &&disagreementIntel.body?.governance?.automatic_machine_override===false
      &&disagreementIntel.body?.governance?.automatic_weighting===false
      &&disagreementIntel.body?.governance?.automatic_promotion===false
      &&disagreementIntel.body?.governance?.automatic_orders===false
      &&disagreementIntel.body?.governance?.capital_permission==='0R',
    `state=${disagreementIntel.body?.state}, reviews=${disagreementIntel.body?.pipeline?.human_review_events}, outcomes=${disagreementIntel.body?.pipeline?.review_outcomes}, disagreements=${disagreementIntel.body?.pipeline?.disagreement_events}, max_n=${disagreementIntel.body?.pipeline?.max_scorable_disagreement_sample}, capital=${disagreementIntel.body?.governance?.capital_permission}`,
    disagreementIntel.latency_ms));
  tests.push(result('v129_contextual_disagreement_intelligence',
    contextIntel.status===200
      &&contextIntel.body?.ok===true
      &&String(contextIntel.body?.version||'').startsWith('v129-')
      &&contextIntel.body?.classifier_version==='v125.3-event-aware-v2'
      &&contextIntel.body?.methodology?.context_frozen_from_post_review_anchor_snapshot===true
      &&contextIntel.body?.methodology?.outcome_context_not_reconstructed_after_resolution===true
      &&contextIntel.body?.methodology?.explicit_disagreement_only_for_cohort_scoring===true
      &&contextIntel.body?.methodology?.trade_pnl_claimed===false
      &&contextIntel.body?.methodology?.intrabar_sequence_not_inferred===true
      &&contextIntel.body?.methodology?.reviewer_identity_public===false
      &&contextIntel.body?.methodology?.reviewer_notes_public===false
      &&Array.isArray(contextIntel.body?.methodology?.dimensions)
      &&contextIntel.body.methodology.dimensions.length===5
      &&contextIntel.body?.governance?.automatic_context_weighting===false
      &&contextIntel.body?.governance?.automatic_human_override===false
      &&contextIntel.body?.governance?.automatic_machine_override===false
      &&contextIntel.body?.governance?.automatic_promotion===false
      &&contextIntel.body?.governance?.automatic_orders===false
      &&contextIntel.body?.governance?.capital_permission==='0R',
    `state=${contextIntel.body?.state}, events=${contextIntel.body?.pipeline?.context_events}, scorable=${contextIntel.body?.pipeline?.scorable_context_events}, cohorts=${contextIntel.body?.pipeline?.cohort_cells}, max_n=${contextIntel.body?.pipeline?.max_cohort_sample}, capital=${contextIntel.body?.governance?.capital_permission}`,
    contextIntel.latency_ms));
  tests.push(result('v130_review_priority_intelligence',
    priorityIntel.status===200
      &&priorityIntel.body?.ok===true
      &&String(priorityIntel.body?.version||'').startsWith('v130-')
      &&priorityIntel.body?.classifier_version==='v125.3-event-aware-v2'
      &&priorityIntel.body?.methodology?.scoring_version==='v130-rule-v1'
      &&Array.isArray(priorityIntel.body?.methodology?.inputs)
      &&priorityIntel.body.methodology.inputs.length===4
      &&priorityIntel.body?.methodology?.performance_evidence_used===false
      &&priorityIntel.body?.methodology?.human_outcome_evidence_used===false
      &&priorityIntel.body?.methodology?.reviewer_reputation_used===false
      &&priorityIntel.body?.methodology?.market_future_data_used===false
      &&priorityIntel.body?.methodology?.ranking_is_attention_routing_not_trade_signal===true
      &&priorityIntel.body?.methodology?.request_ids_public===false
      &&priorityIntel.body?.governance?.automatic_execution===false
      &&priorityIntel.body?.governance?.automatic_promotion===false
      &&priorityIntel.body?.governance?.review_priority_can_grant_capital===false
      &&priorityIntel.body?.governance?.capital_permission==='0R',
    `state=${priorityIntel.body?.state}, assignments=${priorityIntel.body?.pipeline?.assignments}, pending=${priorityIntel.body?.pipeline?.pending_directional_reviews}, p1=${priorityIntel.body?.pipeline?.high_attention_pending}, top=${priorityIntel.body?.pipeline?.top_pending_score}, capital=${priorityIntel.body?.governance?.capital_permission}`,
    priorityIntel.latency_ms));
  tests.push(result('v131_review_freshness_intelligence',
    freshnessIntel.status===200
      &&freshnessIntel.body?.ok===true
      &&String(freshnessIntel.body?.version||'').startsWith('v131-')
      &&freshnessIntel.body?.classifier_version==='v125.3-event-aware-v2'
      &&freshnessIntel.body?.methodology?.target_type==='OPERATIONAL_ATTENTION_TARGET_NOT_MARKET_SIGNAL'
      &&freshnessIntel.body?.methodology?.current_age_derived_from_requested_at===true
      &&freshnessIntel.body?.methodology?.response_latency_derived_only_after_real_human_review===true
      &&freshnessIntel.body?.methodology?.oldest_first_within_equal_priority===true
      &&freshnessIntel.body?.methodology?.performance_evidence_used===false
      &&freshnessIntel.body?.methodology?.reviewer_reputation_used===false
      &&freshnessIntel.body?.methodology?.market_future_data_used===false
      &&freshnessIntel.body?.governance?.automatic_execution===false
      &&freshnessIntel.body?.governance?.automatic_promotion===false
      &&freshnessIntel.body?.governance?.review_freshness_can_grant_capital===false
      &&freshnessIntel.body?.governance?.capital_permission==='0R',
    `state=${freshnessIntel.body?.state}, pending=${freshnessIntel.body?.pipeline?.pending_directional_reviews}, over=${freshnessIntel.body?.pipeline?.over_target_total}, p1_over=${freshnessIntel.body?.pipeline?.over_target_p1}, oldest_p1=${freshnessIntel.body?.pipeline?.oldest_p1_minutes}, capital=${freshnessIntel.body?.governance?.capital_permission}`,
    freshnessIntel.latency_ms));
  tests.push(result('v132_autonomous_shadow_trader',
    shadowTrader.status===200
      &&shadowTrader.body?.ok===true
      &&String(shadowTrader.body?.version||'').startsWith('v132-')
      &&shadowTrader.body?.methodology?.autonomous_event_capture===true
      &&shadowTrader.body?.methodology?.event_study_independent_trades===true
      &&shadowTrader.body?.methodology?.delayed_reference_not_execution_quote===true
      &&shadowTrader.body?.methodology?.intrabar_sequence_inferred===false
      &&shadowTrader.body?.methodology?.broker_spread_measured===false
      &&shadowTrader.body?.methodology?.slippage_measured===false
      &&shadowTrader.body?.methodology?.cost_adjusted_r_available===false
      &&shadowTrader.body?.performance?.trade_pnl_claimed===false
      &&shadowTrader.body?.governance?.shadow_only===true
      &&shadowTrader.body?.governance?.live_trading_enabled===false
      &&shadowTrader.body?.governance?.live_order_eligible===false
      &&shadowTrader.body?.governance?.order_submission_enabled===false
      &&shadowTrader.body?.governance?.automatic_real_capital===false
      &&shadowTrader.body?.governance?.real_capital_permission==='0R'
      &&shadowTrader.body?.governance?.broker_adapter_state==='NOT_CONNECTED'
      &&Number(shadowTrader.body?.pipeline?.total_shadow_intents||0)>=1,
    `state=${shadowTrader.body?.state}, intents=${shadowTrader.body?.pipeline?.total_shadow_intents}, open=${shadowTrader.body?.pipeline?.open_shadow_intents}, resolved=${shadowTrader.body?.pipeline?.resolved_shadow_outcomes}, live=${shadowTrader.body?.governance?.live_trading_enabled}, orders=${shadowTrader.body?.governance?.order_submission_enabled}, capital=${shadowTrader.body?.governance?.real_capital_permission}`,
    shadowTrader.latency_ms));
  tests.push(result('v133_shadow_portfolio_brain',
    shadowPortfolio.status===200
      &&shadowPortfolio.body?.ok===true
      &&String(shadowPortfolio.body?.version||'').startsWith('v133-')
      &&shadowPortfolio.body?.policy?.mode==='ONE_SLOT_FIRST_ELIGIBLE'
      &&Number(shadowPortfolio.body?.policy?.max_concurrent_positions)===1
      &&Number(shadowPortfolio.body?.policy?.shadow_risk_budget_r)===1
      &&shadowPortfolio.body?.policy?.pyramiding===false
      &&shadowPortfolio.body?.policy?.simultaneous_long_short===false
      &&shadowPortfolio.body?.policy?.future_performance_used===false
      &&shadowPortfolio.body?.policy?.reviewer_signal_used===false
      &&shadowPortfolio.body?.policy?.optimization_used===false
      &&shadowPortfolio.body?.methodology?.derives_only_from_v132_shadow_intents===true
      &&shadowPortfolio.body?.methodology?.event_time_ordered===true
      &&shadowPortfolio.body?.methodology?.one_position_slot===true
      &&shadowPortfolio.body?.methodology?.skipped_overlaps_are_not_counted_as_portfolio_trades===true
      &&shadowPortfolio.body?.methodology?.no_future_performance_selection===true
      &&shadowPortfolio.body?.performance?.realized_money_pnl_claimed===false
      &&shadowPortfolio.body?.governance?.shadow_only===true
      &&shadowPortfolio.body?.governance?.live_trading_enabled===false
      &&shadowPortfolio.body?.governance?.live_order_eligible===false
      &&shadowPortfolio.body?.governance?.order_submission_enabled===false
      &&shadowPortfolio.body?.governance?.automatic_real_capital===false
      &&shadowPortfolio.body?.governance?.real_capital_permission==='0R'
      &&shadowPortfolio.body?.governance?.broker_adapter_state==='NOT_CONNECTED'
      &&Number(shadowPortfolio.body?.pipeline?.total_decisions||0)>=1,
    `state=${shadowPortfolio.body?.state}, decisions=${shadowPortfolio.body?.pipeline?.total_decisions}, allocated=${shadowPortfolio.body?.pipeline?.allocated}, skipped=${shadowPortfolio.body?.pipeline?.skipped_overlap}, open=${shadowPortfolio.body?.pipeline?.open_allocations}, resolved=${shadowPortfolio.body?.pipeline?.resolved_allocations}, capital=${shadowPortfolio.body?.governance?.real_capital_permission}`,
    shadowPortfolio.latency_ms));
  tests.push(result('v133_execution_reality_gate',
    executionReality.status===200
      &&executionReality.body?.ok===true
      &&String(executionReality.body?.version||'').startsWith('v133-')
      &&executionReality.body?.methodology?.friction_values_are_stress_scenarios_not_measured_costs===true
      &&executionReality.body?.methodology?.broker_spread_measured===false
      &&executionReality.body?.methodology?.slippage_measured===false
      &&executionReality.body?.methodology?.trade_pnl_claimed===false
      &&executionReality.body?.methodology?.delayed_reference_not_execution_quote===true
      &&executionReality.body?.methodology?.sample_maturity_does_not_grant_live_trading===true
      &&executionReality.body?.methodology?.positive_shadow_evidence_does_not_grant_live_trading===true
      &&Number(executionReality.body?.execution_gate?.infrastructure_total)===6
      &&executionReality.body?.governance?.shadow_only===true
      &&executionReality.body?.governance?.live_trading_enabled===false
      &&executionReality.body?.governance?.live_order_eligible===false
      &&executionReality.body?.governance?.order_submission_enabled===false
      &&executionReality.body?.governance?.automatic_real_capital===false
      &&executionReality.body?.governance?.real_capital_permission==='0R'
      &&executionReality.body?.governance?.broker_adapter_state==='NOT_CONNECTED',
    `state=${executionReality.body?.state}, sample=${executionReality.body?.research?.resolved_sample}, blockers=${executionReality.body?.execution_gate?.blocker_count}, infra=${executionReality.body?.execution_gate?.infrastructure_passed}/${executionReality.body?.execution_gate?.infrastructure_total}, live=${executionReality.body?.governance?.live_trading_enabled}, capital=${executionReality.body?.governance?.real_capital_permission}`,
    executionReality.latency_ms));
  tests.push(result('v134_broker_adapter_lab',
    brokerLab.status===200
      &&brokerLab.body?.ok===true
      &&String(brokerLab.body?.version||'').startsWith('v134-')
      &&brokerLab.body?.state==='PASS_SIMULATION_ONLY'
      &&Number(brokerLab.body?.lab?.tests_passed)===Number(brokerLab.body?.lab?.tests_total)
      &&Number(brokerLab.body?.lab?.tests_total)===6
      &&Number(brokerLab.body?.lab?.real_orders_sent)===0
      &&brokerLab.body?.production_boundary?.production_broker_readiness==='NOT_TESTED'
      &&brokerLab.body?.production_boundary?.real_broker_connected===false
      &&brokerLab.body?.production_boundary?.live_order_route_present===false
      &&brokerLab.body?.production_boundary?.live_order_submission_enabled===false
      &&brokerLab.body?.production_boundary?.simulation_success_does_not_count_as_broker_verification===true
      &&brokerLab.body?.methodology?.no_live_market_quote_used===true
      &&brokerLab.body?.methodology?.no_broker_api_called===true
      &&brokerLab.body?.methodology?.production_order_reconciliation_not_claimed===true
      &&brokerLab.body?.methodology?.production_kill_switch_not_claimed===true
      &&brokerLab.body?.governance?.lab_only===true
      &&brokerLab.body?.governance?.live_trading_enabled===false
      &&brokerLab.body?.governance?.order_submission_enabled===false
      &&brokerLab.body?.governance?.real_capital_permission==='0R',
    `state=${brokerLab.body?.state}, lab=${brokerLab.body?.lab?.tests_passed}/${brokerLab.body?.lab?.tests_total}, real_orders=${brokerLab.body?.lab?.real_orders_sent}, production=${brokerLab.body?.production_boundary?.production_broker_readiness}, capital=${brokerLab.body?.governance?.real_capital_permission}`,
    brokerLab.latency_ms));
  tests.push(result('v135_opportunity_governor',
    opportunityGovernor.status===200
      &&opportunityGovernor.body?.ok===true
      &&String(opportunityGovernor.body?.version||'').startsWith('v135-')
      &&['PAPER_SLOT_ACTIVE','PAPER_AUTONOMY_READY','FAIL_CLOSED'].includes(String(opportunityGovernor.body?.state||''))
      &&['PAPER_ONLY','LOCKED'].includes(String(opportunityGovernor.body?.decision?.autonomous_mode||''))
      &&opportunityGovernor.body?.decision?.live_action==='LOCKED'
      &&opportunityGovernor.body?.governance?.live_trading_enabled===false
      &&opportunityGovernor.body?.governance?.live_order_eligible===false
      &&opportunityGovernor.body?.governance?.order_submission_enabled===false
      &&opportunityGovernor.body?.governance?.automatic_real_capital===false
      &&opportunityGovernor.body?.governance?.human_control_required_for_any_future_live_release===true
      &&opportunityGovernor.body?.governance?.real_capital_permission==='0R',
    `state=${opportunityGovernor.body?.state}, mode=${opportunityGovernor.body?.decision?.autonomous_mode}, paper=${opportunityGovernor.body?.decision?.paper_action}, live=${opportunityGovernor.body?.decision?.live_action}, blockers=${opportunityGovernor.body?.blocker_codes?.length}, capital=${opportunityGovernor.body?.governance?.real_capital_permission}`,
    opportunityGovernor.latency_ms));
  tests.push(result('v116_vercel_workload_identity_transport',
    mission.status===200
      &&mission.headers?.tfa_auth==='VERCEL_OIDC'
      &&mission.headers?.tfa_runtime==='PRIVATE_BRAIN',
    `status=${mission.status}, auth=${mission.headers?.tfa_auth}, runtime=${mission.headers?.tfa_runtime}`,
    mission.latency_ms));
  tests.push(result('v115_private_runtime_anonymous_denial',
    privateAnon.status===401
      &&privateAnon.body?.error==='unauthorized_private_runtime',
    `status=${privateAnon.status}, error=${privateAnon.body?.error}`,
    privateAnon.latency_ms));
  tests.push(result('v70_firewall',auto.body?.governance?.action_permitted==='WAIT'&&auto.body?.governance?.capital_permission==='0R',
    `action=${auto.body?.governance?.action_permitted}, capital=${auto.body?.governance?.capital_permission}`,auto.latency_ms));
  tests.push(result('v75_no_zero_ohlc',day.body?.ok===true&&positive(day.body?.current?.open)&&positive(day.body?.current?.high)&&positive(day.body?.current?.low)&&positive(day.body?.current?.price)&&positive(day.body?.previous?.high)&&positive(day.body?.previous?.low),
    `current=${JSON.stringify(day.body?.current??null)}, previous_high=${day.body?.previous?.high}, previous_low=${day.body?.previous?.low}`,day.latency_ms));
  tests.push(result('v75_shadow_only',day.body?.governance?.canonical===false&&day.body?.governance?.action_permitted==='WAIT'&&day.body?.governance?.capital_permission==='0R',
    `canonical=${day.body?.governance?.canonical}, action=${day.body?.governance?.action_permitted}, capital=${day.body?.governance?.capital_permission}`,day.latency_ms));
  tests.push(result('v76_live_gate',quality.body?.state==='PASS'||quality.body?.state==='PASS_WITH_WARNINGS',
    `state=${quality.body?.state}, critical=${quality.body?.counts?.critical}`,quality.latency_ms));
  tests.push(result('v76_regression_quarantine',selftest.body?.state==='QUARANTINE'&&selftest.body?.self_test?.passed===true,
    `state=${selftest.body?.state}, passed=${selftest.body?.self_test?.passed}`,selftest.latency_ms));
  tests.push(result('v77_shadow_only',tournament.body?.governance?.canonical===false&&tournament.body?.governance?.action_permitted==='WAIT'&&tournament.body?.governance?.capital_permission==='0R'&&tournament.body?.governance?.automatic_model_promotion===false,
    `canonical=${tournament.body?.governance?.canonical}, promotion=${tournament.body?.governance?.automatic_model_promotion}`,tournament.latency_ms));
  tests.push(result('shadow_feed_firewall',shadow.body?.governance?.canonical===false&&shadow.body?.governance?.action_permitted==='WAIT'&&shadow.body?.governance?.capital_permission==='0R',
    `canonical=${shadow.body?.governance?.canonical}, action=${shadow.body?.governance?.action_permitted}`,shadow.latency_ms));
  tests.push(result('quota_probe_truthful',quota.body?.ok===true&&typeof quota.body?.restricted==='boolean',
    `restricted=${quota.body?.restricted}, upstream=${quota.body?.upstream_status}`,quota.latency_ms));
  tests.push(result('v79_state_machine_firewall',v79.body?.ok===true&&v79.body?.governance?.canonical===false&&v79.body?.governance?.action_permitted==='WAIT'&&v79.body?.governance?.capital_permission==='0R',
    `phase=${v79.body?.state?.phase}, action=${v79.body?.governance?.action_permitted}`,v79.latency_ms));
  tests.push(result('v81_mtf_zone_integrity',v81.body?.ok===true&&Array.isArray(v81.body?.zones)&&v81.body.zones.length===5&&v81.body?.governance?.action_permitted==='WAIT',
    `zones=${v81.body?.zones?.length}, composite=${v81.body?.composite?.state}`,v81.latency_ms));
  tests.push(result('v82_confluence_firewall',v82.body?.ok===true&&v82.body?.governance?.canonical===false&&v82.body?.governance?.automatic_execution===false&&v82.body?.governance?.capital_permission==='0R',
    `tension=${v82.body?.confluence?.tension}, capital=${v82.body?.governance?.capital_permission}`,v82.latency_ms));
  tests.push(result('v83_breakout_detector',v83.body?.ok===true&&v83.body?.governance?.canonical===false&&v83.body?.governance?.action_permitted==='WAIT',
    `state=${v83.body?.dominant_state}, quality=${v83.body?.downside?.quality_score ?? v83.body?.upside?.quality_score ?? 'n/a'}`,v83.latency_ms));
  tests.push(result('v83_regression_selftest',v83self.body?.ok===true&&v83self.body?.self_test?.passed===true,
    `accepted=${v83self.body?.self_test?.accepted_state}, failed=${v83self.body?.self_test?.failed_state}`,v83self.latency_ms));

  const q=mission.body?.quant_accountability??{};
  const anchor=q?.external_anchor??{};
  const health=mission.body?.autonomous_health??{};
  const release=mission.body?.release_integrity??{};
  tests.push(result('v106_snapshot_fingerprints',q?.provenance_manifest?.state==='ALL_FINGERPRINTED',
    `state=${q?.provenance_manifest?.state}, fingerprinted=${q?.provenance_manifest?.counts?.fingerprinted ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v107_receipt_chain',q?.provenance_receipt_ledger?.state==='HASH_CHAIN_VERIFIED',
    `state=${q?.provenance_receipt_ledger?.state}, failures=${q?.provenance_receipt_ledger?.counts?.chain_link_failures ?? 'n/a'}, mode=${q?.provenance_receipt_source_mode ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v108_server_attestation',q?.provenance_attestation?.state==='SERVER_ATTESTATION_VERIFIED',
    `state=${q?.provenance_attestation?.state}, failed=${q?.provenance_attestation?.counts?.failed_attestations ?? 'n/a'}, mode=${q?.provenance_attestation_source_mode ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v109_key_lifecycle',q?.attestation_key_lifecycle?.state==='KEY_LIFECYCLE_HEALTHY',
    `state=${q?.attestation_key_lifecycle?.state}, missing=${q?.attestation_key_lifecycle?.counts?.missing_vault_keys ?? 'n/a'}, mode=${q?.attestation_key_lifecycle_source_mode ?? 'n/a'}`,mission.latency_ms));
  const provenanceModes=[
    q?.provenance_receipt_source_mode,
    q?.provenance_attestation_source_mode,
    q?.attestation_key_lifecycle_source_mode
  ];
  const allowedProvenanceModes=['POSTGREST_RPC','VERIFIED_SNAPSHOT_FALLBACK','CHECKPOINT_VERIFIED_SURVIVOR'];
  const bridgeUsed=provenanceModes.includes('CHECKPOINT_VERIFIED_SURVIVOR');
  tests.push(result('v1131_provenance_survivor_truth',
    provenanceModes.every(mode=>allowedProvenanceModes.includes(String(mode)))
      &&(!bridgeUsed||q?.provenance_checkpoint?.state==='GLOBAL_CHECKPOINT_VERIFIED'),
    `modes=${provenanceModes.join(',')}, checkpoint=${q?.provenance_checkpoint?.state}`,mission.latency_ms));
  tests.push(result('v110_checkpoint_chain',q?.provenance_checkpoint?.state==='GLOBAL_CHECKPOINT_VERIFIED',
    `state=${q?.provenance_checkpoint?.state}, broken=${q?.provenance_checkpoint?.counts?.chain_link_failures ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v111_external_root',anchor?.root_state==='MATCH'||anchor?.root_state==='PENDING_NEWER_CHECKPOINT',
    `root_state=${anchor?.root_state}, roots_match=${anchor?.comparison?.roots_match}`,mission.latency_ms));
  tests.push(result('v112_anchor_heartbeat',anchor?.heartbeat_state==='FRESH'&&Number(anchor?.age_minutes)<=90,
    `heartbeat=${anchor?.heartbeat_state}, age=${anchor?.age_minutes}m, checks=${anchor?.verification_count ?? 'n/a'}`,mission.latency_ms));
  tests.push(result('v112_capital_firewall',q?.publication_gates?.capital_permission==='0R'&&mission.body?.governance?.capital_permission==='0R',
    `quant=${q?.publication_gates?.capital_permission}, mission=${mission.body?.governance?.capital_permission}`,mission.latency_ms));
  tests.push(result('v113_health_orchestrator',health?.ok===true&&['NOMINAL','GUARDED'].includes(String(health?.state))&&health?.governance?.action_permitted==='WAIT'&&health?.governance?.capital_permission==='0R',
    `state=${health?.state}, readiness=${health?.readiness_pct ?? 'n/a'}%, critical=${health?.summary?.critical_failures ?? 'n/a'}, capital=${health?.governance?.capital_permission}`,mission.latency_ms));
  tests.push(result('v1132_release_integrity',release?.ok===true&&release?.state==='PRODUCTION_SOURCE_VERIFIED'&&release?.environment==='production'&&release?.git_branch==='the-father-analytics-deploy'&&/^[a-f0-9]{40}$/i.test(String(release?.git_commit_sha??''))&&release?.governance?.capital_permission==='0R',
    `state=${release?.state}, env=${release?.environment}, branch=${release?.git_branch}, sha=${release?.git_commit_short??'withheld'}, capital=${release?.governance?.capital_permission}`,mission.latency_ms));


  const registry=Array.isArray(mission.body?.engine_registry)?mission.body.engine_registry:[];
  const registryNames=new Set(registry.map((engine:any)=>String(engine?.name||'')));
  const invalidRegistryRows=registry.filter((engine:any)=>!engine?.name||!engine?.state||!engine?.detail);
  const hardFailureRegistryRows=registry.filter((engine:any)=>/^(FAIL|FAILED|CRITICAL|ERROR|UNAVAILABLE)$/i.test(String(engine?.state||'').trim()));
  const brierEngine=registry.find((engine:any)=>engine?.name==='Brier Calibration');
  const evEngine=registry.find((engine:any)=>engine?.name==='Expected Value Engine');
  const portfolioEngine=registry.find((engine:any)=>engine?.name==='Portfolio Risk');
  tests.push(result('v168_engine_registry_completeness',
    mission.status===200&&registry.length>=44&&registryNames.size===registry.length,
    `registry=${registry.length}, unique=${registryNames.size}`,mission.latency_ms));
  tests.push(result('v168_engine_registry_schema_integrity',
    registry.length>=44&&invalidRegistryRows.length===0,
    `invalid_rows=${invalidRegistryRows.length}`,mission.latency_ms));
  tests.push(result('v168_engine_registry_no_hard_failure',
    registry.length>=44&&hardFailureRegistryRows.length===0,
    `hard_failures=${hardFailureRegistryRows.map((x:any)=>x.name+':'+x.state).join('|')||'none'}`,mission.latency_ms));
  tests.push(result('v168_learning_gates_truthful',
    brierEngine?.state==='GATED'
      &&['LEARNING','EVIDENCE-GATED'].includes(String(evEngine?.state||''))
      &&portfolioEngine?.state==='OBSERVATION ONLY',
    `brier=${brierEngine?.state}, ev=${evEngine?.state}, portfolio=${portfolioEngine?.state}`,mission.latency_ms));
  const v169RequiredModules=[
    'Professional Capital OS',
    'Official Macro Calendar',
    'Earnings Intelligence',
    'Production Closure Gate',
    'Full-Engine Certification',
    'Scheduler Evidence Cache'
  ];
  const v169Missing=v169RequiredModules.filter((name)=>!registryNames.has(name));
  tests.push(result('v169_integrated_registry_modules',
    registry.length>=44&&v169Missing.length===0,
    `registry=${registry.length}, missing=${v169Missing.join('|')||'none'}`,
    mission.latency_ms));
  tests.push(result('v168_global_capital_invariant',
    mission.body?.governance?.action_permitted==='WAIT'
      &&mission.body?.governance?.capital_permission==='0R'
      &&mission.body?.autonomous_health?.governance?.action_permitted==='WAIT'
      &&mission.body?.autonomous_health?.governance?.capital_permission==='0R',
    `mission=${mission.body?.governance?.action_permitted}/${mission.body?.governance?.capital_permission}, health=${mission.body?.autonomous_health?.governance?.action_permitted}/${mission.body?.autonomous_health?.governance?.capital_permission}`,
    mission.latency_ms));

  tests.push(result('v172_paper_quote_intake_contract',
    paperFeed.status===200&&paperFeed.body?.ok===true
      &&['NOT_CONNECTED','PAPER_QUOTE_FRESH_UNVERIFIED','PAPER_QUOTE_STALE'].includes(String(paperFeed.body?.state))
      &&paperFeed.body?.governance?.capital_permission==='0R'
      &&paperFeed.body?.governance?.live_order_submission_enabled===false
      &&paperFeed.body?.broker_connection_verified===false,
    `state=${paperFeed.body?.state}, broker_verified=${paperFeed.body?.broker_connection_verified}, capital=${paperFeed.body?.governance?.capital_permission}`,
    paperFeed.latency_ms));
  tests.push(result('v172_paper_quote_anonymous_denial',
    paperFeedAnon.status===401&&paperFeedAnon.body?.error==='missing_token',
    `status=${paperFeedAnon.status}, error=${paperFeedAnon.body?.error}`,paperFeedAnon.latency_ms));
  tests.push(result('v172_paper_quote_surface_contract',
    gold.status===200&&typeof gold.body==='string'&&gold.body.includes('id="v172-paper-broker-feed"')
      &&gold.body.includes('id="v172-bid"')&&gold.body.includes('id="v172-feed-state"'),
    `status=${gold.status}, paper_feed=${typeof gold.body==='string'&&gold.body.includes('id="v172-paper-broker-feed"')?'present':'missing'}`,gold.latency_ms));
  tests.push(result('v173_owner_paper_quote_surface_contract',
    ownerSurface.status===200&&typeof ownerSurface.body==='string'
      &&ownerSurface.body.includes('id="paperQuoteIntake" class="card status-box hidden"')
      &&ownerSurface.body.includes('id="paperQuoteSubmit" type="submit" disabled')
      &&ownerSurface.body.includes('id="paperQuoteJson"')&&ownerSurface.body.includes('id="paperQuoteReceipt"'),
    `status=${ownerSurface.status}, paper_intake=${typeof ownerSurface.body==='string'&&ownerSurface.body.includes('id="paperQuoteIntake"')?'present':'missing'}, default_locked=true`,ownerSurface.latency_ms));

  tests.push(result('v190_live_xauusd_runtime_contract',
    v186live.status===200&&v186live.body?.ok===true&&v186live.body?.symbol==='XAUUSD'
      &&v186live.body?.governance?.action_permitted==='WAIT'
      &&v186live.body?.governance?.capital_permission==='0R'
      &&v186live.body?.governance?.market_data_only===true
      &&v186live.body?.governance?.machine_execution_allowed===false
      &&v186live.body?.governance?.live_order_submission_enabled===false,
    `status=${v186live.status}, state=${v186live.body?.state}, capital=${v186live.body?.governance?.capital_permission}`,
    v186live.latency_ms));
  tests.push(result('v190_signal_map_runtime_contract',
    v187signal.status===200&&v187signal.body?.ok===true&&v187signal.body?.symbol==='XAUUSD'
      &&Array.isArray(v187signal.body?.tradeable_zones?.zones)&&v187signal.body.tradeable_zones.zones.length===5
      &&typeof v187signal.body?.signal_day?.state==='string'
      &&typeof v187signal.body?.signal_time?.state==='string'
      &&v187signal.body?.governance?.action_permitted==='WAIT'
      &&v187signal.body?.governance?.capital_permission==='0R'
      &&v187signal.body?.governance?.machine_execution_allowed===false,
    `status=${v187signal.status}, signal_day=${v187signal.body?.signal_day?.state}, signal_time=${v187signal.body?.signal_time?.state}, zones=${v187signal.body?.tradeable_zones?.zones?.length ?? 0}`,
    v187signal.latency_ms));
  tests.push(result('v190_session_liquidity_runtime_contract',
    v188session.status===200&&v188session.body?.ok===true
      &&Array.isArray(v188session.body?.sessions)&&v188session.body.sessions.length===3
      &&v188session.body?.governance?.action_permitted==='WAIT'
      &&v188session.body?.governance?.capital_permission==='0R'
      &&v188session.body?.governance?.automatic_execution===false,
    `status=${v188session.status}, sessions=${v188session.body?.sessions?.length ?? 0}, capital=${v188session.body?.governance?.capital_permission}`,
    v188session.latency_ms));
  tests.push(result('v190_signal_lifecycle_runtime_contract',
    v188lifecycle.status===200&&v188lifecycle.body?.ok===true&&v188lifecycle.body?.symbol==='XAUUSD'
      &&typeof v188lifecycle.body?.lifecycle?.stage==='string'
      &&v188lifecycle.body?.governance?.action_permitted==='WAIT'
      &&v188lifecycle.body?.governance?.capital_permission==='0R'
      &&v188lifecycle.body?.governance?.machine_execution_allowed===false,
    `status=${v188lifecycle.status}, stage=${v188lifecycle.body?.lifecycle?.stage}, capital=${v188lifecycle.body?.governance?.capital_permission}`,
    v188lifecycle.latency_ms));
  tests.push(result('v190_trigger_watch_runtime_contract',
    v189watch.status===200&&v189watch.body?.ok===true&&v189watch.body?.symbol==='XAUUSD'
      &&Array.isArray(v189watch.body?.triggers)&&v189watch.body.triggers.length>=7
      &&typeof v189watch.body?.review_gate?.ready==='boolean'
      &&v189watch.body?.governance?.action_permitted==='WAIT'
      &&v189watch.body?.governance?.capital_permission==='0R'
      &&v189watch.body?.governance?.machine_execution_allowed===false
      &&v189watch.body?.governance?.live_order_submission_enabled===false,
    `status=${v189watch.status}, state=${v189watch.body?.state}, triggers=${v189watch.body?.triggers?.length ?? 0}, review=${v189watch.body?.review_gate?.ready}, capital=${v189watch.body?.governance?.capital_permission}`,
    v189watch.latency_ms));

  tests.push(result('v191_gold_event_ledger_runtime_contract',
    v191ledger.status===200&&v191ledger.body?.ok===true
      &&v191ledger.body?.state==='HASH_CHAIN_VERIFIED'
      &&Number(v191ledger.body?.counts?.events||0)>=1
      &&Number(v191ledger.body?.counts?.chain_failures||0)===0
      &&Array.isArray(v191ledger.body?.events)
      &&v191ledger.body?.governance?.append_only===true
      &&v191ledger.body?.governance?.hash_chained===true
      &&v191ledger.body?.governance?.action_permitted==='WAIT'
      &&v191ledger.body?.governance?.capital_permission==='0R'
      &&v191ledger.body?.governance?.automatic_execution===false
      &&v191ledger.body?.governance?.live_order_submission_enabled===false,
    `status=${v191ledger.status}, state=${v191ledger.body?.state}, events=${v191ledger.body?.counts?.events ?? 0}, chain_failures=${v191ledger.body?.counts?.chain_failures ?? 'n/a'}, capital=${v191ledger.body?.governance?.capital_permission}`,
    v191ledger.latency_ms));

  tests.push(result('v192_gold_alert_router_runtime_contract',
    v192router.status===200&&v192router.body?.ok===true
      &&v192router.body?.state==='ROUTER_CHAIN_VERIFIED'
      &&Number(v192router.body?.counts?.chain_failures||0)===0
      &&Array.isArray(v192router.body?.alerts)
      &&v192router.body?.policy?.version==='V192_ALERT_ROUTER_V1'
      &&v192router.body?.policy?.transport_enabled===false
      &&v192router.body?.policy?.historical_retrofit===false
      &&v192router.body?.governance?.priority_score_not_probability===true
      &&v192router.body?.governance?.alerts_are_review_prompts_only===true
      &&v192router.body?.governance?.action_permitted==='WAIT'
      &&v192router.body?.governance?.capital_permission==='0R'
      &&v192router.body?.governance?.automatic_execution===false
      &&v192router.body?.governance?.live_order_submission_enabled===false,
    `status=${v192router.status}, state=${v192router.body?.state}, routes=${v192router.body?.counts?.routes ?? 0}, alerts=${v192router.body?.counts?.visible_alerts ?? 0}, transport=${v192router.body?.policy?.transport_enabled}, capital=${v192router.body?.governance?.capital_permission}`,
    v192router.latency_ms));

  tests.push(result('v194_gold_command_snapshot_runtime_contract',
    v194command.status===200&&v194command.body?.ok===true
      &&v194command.body?.version==='v194-gold-command-snapshot-v1'
      &&v194command.body?.symbol==='XAUUSD'
      &&typeof v194command.body?.state==='string'
      &&Array.isArray(v194command.body?.blockers)
      &&v194command.body?.components?.live_xauusd
      &&v194command.body?.components?.signal_map
      &&v194command.body?.components?.lifecycle
      &&v194command.body?.components?.trigger_watch
      &&v194command.body?.components?.event_ledger
      &&v194command.body?.components?.alert_router
      &&v194command.body?.components?.owner_alert_inbox?.state==='AAL2_OWNER_ONLY'
      &&v194command.body?.governance?.canonical_read_model===true
      &&v194command.body?.governance?.human_review_not_trade_approval===true
      &&v194command.body?.governance?.action_permitted==='WAIT'
      &&v194command.body?.governance?.capital_permission==='0R'
      &&v194command.body?.governance?.automatic_execution===false
      &&v194command.body?.governance?.live_order_submission_enabled===false,
    `status=${v194command.status}, state=${v194command.body?.state}, blockers=${v194command.body?.blockers?.length ?? 'n/a'}, signal_day=${v194command.body?.command?.signal_day}, signal_time=${v194command.body?.command?.signal_time}, live=${v194command.body?.command?.live_market_state}, capital=${v194command.body?.governance?.capital_permission}`,
    v194command.latency_ms));

  tests.push(result('v195_gold_bridge_readiness_runtime_contract',
    v195bridge.status===200&&v195bridge.body?.ok===true
      &&v195bridge.body?.version==='v195-gold-bridge-readiness-v1'
      &&v195bridge.body?.symbol==='XAUUSD'
      &&['NO_BRIDGE_ENROLLED','BRIDGE_ENROLLED_WAITING_FIRST_TICK','BRIDGE_ACTIVITY_WITHOUT_FRESH_QUOTE','BROKER_QUOTE_STALE','BROKER_LIVE'].includes(String(v195bridge.body?.state||''))
      &&typeof v195bridge.body?.gates?.bridge_enrolled?.pass==='boolean'
      &&typeof v195bridge.body?.gates?.first_tick_received?.pass==='boolean'
      &&typeof v195bridge.body?.gates?.quote_fresh?.pass==='boolean'
      &&typeof v195bridge.body?.gates?.broker_live?.pass==='boolean'
      &&v195bridge.body?.privacy?.bridge_ids_public===false
      &&v195bridge.body?.privacy?.bridge_keys_public===false
      &&v195bridge.body?.privacy?.owner_identity_public===false
      &&v195bridge.body?.privacy?.account_number_public===false
      &&v195bridge.body?.governance?.market_data_only===true
      &&v195bridge.body?.governance?.commissioning_not_trade_permission===true
      &&v195bridge.body?.governance?.action_permitted==='WAIT'
      &&v195bridge.body?.governance?.capital_permission==='0R'
      &&v195bridge.body?.governance?.automatic_execution===false
      &&v195bridge.body?.governance?.live_order_submission_enabled===false,
    `status=${v195bridge.status}, state=${v195bridge.body?.state}, active=${v195bridge.body?.public_counts?.active_bridges ?? 'n/a'}, activity=${v195bridge.body?.public_counts?.bridges_with_activity ?? 'n/a'}, next=${v195bridge.body?.next_step_code}, capital=${v195bridge.body?.governance?.capital_permission}`,
    v195bridge.latency_ms));

  tests.push(result('v195_gold_bridge_readiness_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V195 · BROKER BRIDGE COMMISSIONING')
      &&gold.body.includes('id="v195-state"')
      &&gold.body.includes('id="v195-g1"')
      &&gold.body.includes('id="v195-g4"'),
    `status=${gold.status}, surface=${typeof gold.body==='string'&&gold.body.includes('V195 · BROKER BRIDGE COMMISSIONING')?'present':'missing'}`,
    gold.latency_ms));
  tests.push(result('v196_gold_feed_quality_runtime_contract',
    v196quality.status===200&&v196quality.body?.ok===true
      &&v196quality.body?.version==='v196-gold-feed-quality-v1'
      &&v196quality.body?.symbol==='XAUUSD'
      &&['NO_TICKS','PROBATION_WARMING','LIVE_FEED_QUALITY_PASS','FEED_STALE','FEED_QUALITY_DEGRADED'].includes(String(v196quality.body?.state||''))
      &&typeof v196quality.body?.deterministic_quality_score==='number'
      &&typeof v196quality.body?.gates?.freshness?.pass==='boolean'
      &&typeof v196quality.body?.gates?.cadence?.pass==='boolean'
      &&typeof v196quality.body?.gates?.sequence_integrity?.pass==='boolean'
      &&typeof v196quality.body?.gates?.terminal_connected?.pass==='boolean'
      &&typeof v196quality.body?.gates?.relay_contract?.pass==='boolean'
      &&typeof v196quality.body?.gates?.transport_lag?.pass==='boolean'
      &&typeof v196quality.body?.gates?.quote_integrity?.pass==='boolean'
      &&v196quality.body?.privacy?.bridge_id_public===false
      &&v196quality.body?.privacy?.sequence_public===false
      &&v196quality.body?.privacy?.payload_hash_public===false
      &&v196quality.body?.governance?.quality_score_not_probability===true
      &&v196quality.body?.governance?.probation_required===true
      &&v196quality.body?.governance?.feed_quality_cannot_grant_trade_permission===true
      &&v196quality.body?.governance?.action_permitted==='WAIT'
      &&v196quality.body?.governance?.capital_permission==='0R'
      &&v196quality.body?.governance?.automatic_execution===false
      &&v196quality.body?.governance?.live_order_submission_enabled===false,
    `status=${v196quality.status}, state=${v196quality.body?.state}, score=${v196quality.body?.deterministic_quality_score}, ticks60=${v196quality.body?.gates?.cadence?.ticks_60s ?? 'n/a'}, capital=${v196quality.body?.governance?.capital_permission}`,
    v196quality.latency_ms));

  tests.push(result('v196_gold_feed_quality_surface_contract',
    gold.status===200
      &&typeof gold.body==='string'
      &&gold.body.includes('V196 · LIVE FEED QUALITY PROBATION')
      &&gold.body.includes('id="v196-state"')
      &&gold.body.includes('id="v196-sequence"')
      &&gold.body.includes('id="v196-contract"'),
    `status=${gold.status}, surface=${typeof gold.body==='string'&&gold.body.includes('V196 · LIVE FEED QUALITY PROBATION')?'present':'missing'}`,
    gold.latency_ms));

  const passed=tests.filter(x=>x.pass).length;
  const failed=tests.length-passed;
  const transportStatus=transport.summary([home,capitalSurface,capitalCalendar,earningsCalendar,gold,desk,learning,outcome,transition,trigger,reputation,reviewIntel,disagreementIntel,contextIntel,priorityIntel,freshnessIntel,shadowTrader,shadowPortfolio,executionReality,brokerLab,opportunityGovernor,ownerReviewAnon,privateAnon,auto,day,quality,selftest,tournament,shadow,quota,v79,v81,v82,v83,v83self,v186live,v187signal,v188session,v188lifecycle,v189watch,v191ledger,v192router,v194command,v195bridge,v196quality,mission,paperFeed,paperFeedAnon,productionClosure,ownerSurface]);
  transportStatus.probes=[['home',home],['capitalSurface',capitalSurface],['gold',gold],['ownerSurface',ownerSurface],['ownerReviewAnon',ownerReviewAnon],['privateAnon',privateAnon],['paperFeedAnon',paperFeedAnon],['paperFeed',paperFeed],['mission',mission],['productionClosure',productionClosure],['opportunityGovernor',opportunityGovernor],['capitalCalendar',capitalCalendar],['earningsCalendar',earningsCalendar],['desk',desk],['learning',learning],['outcome',outcome],['transition',transition],['trigger',trigger],['reputation',reputation],['reviewIntel',reviewIntel],['disagreementIntel',disagreementIntel],['contextIntel',contextIntel],['priorityIntel',priorityIntel],['freshnessIntel',freshnessIntel],['shadowTrader',shadowTrader],['shadowPortfolio',shadowPortfolio],['executionReality',executionReality],['brokerLab',brokerLab],['auto',auto],['day',day],['quality',quality],['selftest',selftest],['tournament',tournament],['shadow',shadow],['quota',quota],['v79',v79],['v81',v81],['v82',v82],['v83',v83],['v83self',v83self],['v186live',v186live],['v187signal',v187signal],['v188session',v188session],['v188lifecycle',v188lifecycle],['v189watch',v189watch],['v191ledger',v191ledger],['v192router',v192router],['v194command',v194command],['v195bridge',v195bridge],['v196quality',v196quality]].map(([name,probe]:any)=>({name,status:probe.status,started:probe.started,latency_ms:probe.latency_ms,error:probe.error,deadline_exceeded:probe.deadline_exceeded===true}));
  const state=transportStatus.incomplete?'INCOMPLETE':failed===0?'PASS':failed<=2?'DEGRADED':'FAIL';
  const maxLatency=Math.max(...tests.map(x=>Number(x.latency_ms)||0));
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({
    ok:failed===0&&!transportStatus.incomplete,
    version:VERSION,
    checked_at:new Date().toISOString(),
    state,
    summary:{passed,failed,total:tests.length,max_latency_ms:maxLatency},
    tests,
    transport:transportStatus,
    invariants:{
      canonical_execution_permission:'UNCHANGED',
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_promotion:false
    }
  });
}
Deno.serve(async(req:Request)=>{
  const startedAt=performance.now();
  if(!(await tfaPrivateAuthorized(req))){
    return Response.json(
      {ok:false,error:'unauthorized_private_runtime'},
      {status:401,headers:{'Cache-Control':'no-store'}}
    );
  }
  const headers=new Headers();
  let status=200;
  const res:any={
    setHeader(name:string,value:string){headers.set(name,String(value));},
    status(code:number){status=code;return res;},
    json(body:any){headers.set('Content-Type','application/json');return new Response(JSON.stringify(body),{status,headers});}
  };
  const transport=createQaTransport({startedAt,requestSignal:req.signal});
  try{return await legacyHandler(req,res,transport);}finally{transport.close();}
});
