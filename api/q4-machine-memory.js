const BASE='https://mpcelmjiycjpdyyflisn.supabase.co/functions/v1';
const ORIGIN='https://thefatheranalytics.com';

const SOURCES={
  cross_asset:'public-cross-asset-regime',
  regime_history:'public-regime-change-history',
  forecast_governance:'public-forecast-governance',
  forecast_accountability:'public-forecast-accountability',
  forecast_attribution:'public-forecast-error-attribution'
};

async function readSupabase(slug,timeout=14000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const r=await fetch(`${BASE}/${slug}?t=${Date.now()}`,{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-MEMORY/3.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    const body=await r.json().catch(()=>null);
    return r.ok&&body&&typeof body==='object'&&!Array.isArray(body)
      ? body
      : {ok:false,state:'UNAVAILABLE',source:slug,status:r.status};
  }catch{
    return {ok:false,state:'UNAVAILABLE',source:slug,error:'source_unavailable'};
  }finally{ clearTimeout(timer); }
}

async function readMachine(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const r=await fetch(ORIGIN+'/api/q4-machine-state',{
      headers:{Accept:'application/json','User-Agent':'THE-FATHER-ANALYTICS-Q4-MEMORY/3.0'},
      cache:'no-store',
      signal:controller.signal,
      redirect:'error'
    });
    return r.ok ? await r.json().catch(()=>null) : null;
  }catch{return null}finally{clearTimeout(timer)}
}

function safeCount(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-TFA-Machine','Q4-MEMORY-V3');
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({ok:false,error:'method_not_allowed'});
  }

  const [machine,cross,history,governance,accountability,attribution]=await Promise.all([
    readMachine(),
    readSupabase(SOURCES.cross_asset,12000),
    readSupabase(SOURCES.regime_history,12000),
    readSupabase(SOURCES.forecast_governance,15000),
    readSupabase(SOURCES.forecast_accountability,15000),
    readSupabase(SOURCES.forecast_attribution,15000)
  ]);

  const assets=Array.isArray(cross?.assets)?cross.assets:[];
  const gold=assets.find(x=>String(x?.key).toLowerCase()==='gold')||null;
  const drivers=assets.filter(x=>['dxy','us10y','spx','bitcoin','brent','eurusd'].includes(String(x?.key).toLowerCase()))
    .map(x=>({
      key:x.key,label:x.label,direction:x.direction,phase:x.phase,
      structural_state:x.structural_state,timeframe_alignment:x.timeframe_alignment,
      nearest_liquidity:x.nearest_liquidity??null
    }));

  const forecastLedger=accountability?.forecast_ledger??governance?.forecast_ledger??null;
  const canonicalHistoryAvailable=history?.ok===true && history?.state!=='EVIDENCE_STORE_UNAVAILABLE';

  const available=[cross,history,governance,accountability,attribution].filter(x=>x?.ok===true).length;

  return res.status(200).json({
    ok:available>0,
    version:'q4-machine-memory-v3',
    generated_at:new Date().toISOString(),
    machine:machine?.ok?machine:null,
    regime_matrix:{
      state:cross?.ok===true?'AVAILABLE':'UNAVAILABLE',
      risk_tone:cross?.risk_tone??'WITHHELD',
      breadth:cross?.breadth??null,
      gold_macro_alignment:cross?.gold_macro_alignment??'WITHHELD',
      fingerprint:cross?.regime_fingerprint??null,
      gold,
      assets,
      drivers
    },
    regime_history:{
      state:canonicalHistoryAvailable?'AVAILABLE':'EVIDENCE_STORE_UNAVAILABLE',
      pulse_count:canonicalHistoryAvailable?safeCount(history?.pulse_count):null,
      transition_count:canonicalHistoryAvailable?safeCount(history?.transition_count):null,
      cross_asset_change_count:canonicalHistoryAvailable?safeCount(history?.cross_asset_change_count):null,
      recent_transitions:canonicalHistoryAvailable&&Array.isArray(history?.recent_transitions)?history.recent_transitions.slice(0,20):[],
      recent_cross_asset_changes:canonicalHistoryAvailable&&Array.isArray(history?.recent_cross_asset_changes)?history.recent_cross_asset_changes.slice(0,12):[],
      last_pulse_at:canonicalHistoryAvailable?history?.last_pulse_at??null:null,
      withholding:canonicalHistoryAvailable?null:(history?.methodology?.withholding??'Canonical history unavailable; do not fabricate transitions.')
    },
    forecast_memory:{
      state:accountability?.accountability_state??governance?.state??'UNAVAILABLE',
      ledger:forecastLedger,
      open_forecasts:Array.isArray(accountability?.open_forecasts)
        ?accountability.open_forecasts.slice(0,8)
        :Array.isArray(governance?.open_forecasts)?governance.open_forecasts.slice(0,8):[],
      governance:governance?.ok===true?{
        state:governance?.state,
        structural_live_test:governance?.structural_live_test??null,
        gold_benchmark:governance?.gold_benchmark??null,
        session_performance:governance?.session_performance??null
      }:null,
      attribution:attribution?.ok===true?{
        publication_forecasts:attribution?.publication_forecasts??null,
        structural_live_test:attribution?.structural_live_test??null,
        gold_benchmark:attribution?.gold_benchmark??null,
        limits:attribution?.attribution_limits??null
      }:null
    },
    causality_radar:{
      status:'DESCRIPTIVE_NOT_CAUSAL_PROOF',
      gold_direction:gold?.direction??'WITHHELD',
      gold_phase:gold?.phase??'WITHHELD',
      macro_alignment:cross?.gold_macro_alignment??'WITHHELD',
      risk_tone:cross?.risk_tone??'WITHHELD',
      drivers,
      note:'Direction and structural alignment are descriptive cross-asset observations. No causal coefficient or causal claim is inferred.'
    },
    source_health:{
      available_sources:available,
      requested_sources:5,
      canonical_history_available:canonicalHistoryAvailable
    },
    governance:{
      research_only:true,
      action_permitted:'WAIT',
      capital_permission:'0R',
      automatic_execution:false,
      rule:'Memory, calibration, regime and cross-asset context can tighten research conclusions but cannot promote trading permission.'
    }
  });
}
