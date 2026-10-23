import {sourceAge,sourceCurrent,incidentObservation,sourceEvidence,cacheLifetime} from '../_shared/public-launch-observation.mjs';
export const RUNTIME_PATHS=Object.freeze(['public-v50-production-integrity','public-app-config',
 'public-v65-model-evidence-fabric','public-v69-database-incident-shield']);
export function runtimeCacheTtl(body){return cacheLifetime(body,body.certification_state==='HOLD'?60000:
 body.certification_state==='PARTIAL'?120000:300000);}
export function assembleRuntimeObservatory(records,now=Date.now()){
 const [integrity,config,evidence,incident]=RUNTIME_PATHS.map(path=>records[path]);
 const i=integrity?.body??{},c=config?.body??{},e=evidence?.body??{};
 const iOk=sourceCurrent(integrity,now)&&String(i.version??'').startsWith('v50-');
 const cOk=sourceCurrent(config,now,1200);
 const eOk=sourceCurrent(evidence,now,1200)&&String(e.version??'').startsWith('v65-');
 const db=incidentObservation(incident,now);
 const integrityReady=iOk&&['READY','RUNTIME_READY','RUNTIME_DEGRADED_MARKET_DATA'].includes(i.state);
 const degraded=integrityReady&&i.state==='RUNTIME_DEGRADED_MARKET_DATA';
 const metric=(record)=>({age_seconds:sourceAge(record,now),http_status:record?.http_status??0,latency_ms:record?.latency_ms??null});
 const gates=[
  {key:'database_incident',passed:db.active===false,state:db.state,...metric(incident)},
  {key:'production_integrity',passed:integrityReady,state:iOk?(i.state||'UNVERIFIED'):'UNVERIFIED',...metric(integrity)},
  {key:'market_data_semantics',passed:integrityReady&&!degraded,state:!integrityReady?'UNVERIFIED':degraded?'DEGRADED':'AVAILABLE',...metric(integrity)},
  {key:'release_contract',passed:cOk&&c.runtime_safety?.mode==='CONTROLLED_LOAD'&&c.runtime_safety?.high_frequency_polling===false,
   state:cOk?(c.app?.mission_control_version??'UNVERIFIED'):'UNVERIFIED',...metric(config)},
  {key:'model_evidence',passed:eOk&&typeof e.calibration?.performance_state==='string'
   &&e.calibration.performance_state.length>0&&e.calibration.performance_state!=='EVIDENCE_STORE_UNAVAILABLE',
   state:eOk?(e.calibration?.performance_state??'UNVERIFIED'):'UNVERIFIED',...metric(evidence)},
  {key:'freshness',passed:iOk&&cOk&&eOk,state:'OBSERVED_TIMESTAMPS',age_seconds:null,http_status:null,latency_ms:null},
  {key:'rate_policy',passed:cOk&&c.runtime_safety?.production_smoke_mode==='RATE_SAFE'
   &&c.runtime_safety?.cache_busting_on_core_aggregators===false&&c.runtime_safety?.cache_busting_on_browser_surfaces===false,
   state:cOk?'CONTROLLED_LOAD':'UNVERIFIED',age_seconds:null,http_status:null,latency_ms:null}
 ];
 const failed=gates.filter(g=>!g.passed).map(g=>g.key);
 const hard=failed.some(key=>['database_incident','production_integrity','release_contract'].includes(key));
 const certification=hard?'HOLD':failed.length?'PARTIAL':'BASELINE_READY';
 return {ok:true,version:'v66-runtime-observatory-v10-v262-source-safe',generated_at:new Date(now).toISOString(),
  certification_state:certification,provider_rate_limit_status:'UNVERIFIED_EXTERNALLY',
  provider_confirmation:{confirmed:false,source:null,confirmed_on:null,
   scope:'Provider-side rate-limit status requires independent verification.'},
  external_unknowns:['provider_rate_limit_status'],load_policy:'CONTROLLED_LOAD',gates,failed_gates:failed,
  source_evidence:sourceEvidence(records,now,{'public-app-config':1200,'public-v65-model-evidence-fabric':1200}),
  runtime_observations:{
   production_integrity:{state:iOk?(i.state??null):null,reachable:integrity?.ok===true,
    http_status:integrity?.http_status??0,latency_ms:integrity?.latency_ms??null,
    cache_header:integrity?.cache_header??null,tfa_cache:integrity?.tfa_cache??null},
   release_contract:{mission_control_version:cOk?(c.app?.mission_control_version??null):null,
    config_version:cOk?(c.config_version??null):null,...metric(config)},
   model_evidence:{performance_state:eOk?(e.calibration?.performance_state??null):null,
    sample_size:eOk?(e.calibration?.sample_size??null):null,...metric(evidence)},
   database_incident:{active:db.active,code:db.code,verified:db.verified,...metric(incident)}
  },
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,
   rule:'Runtime certification cannot upgrade trading permission.'},
  next_gate:certification==='BASELINE_READY'
   ?'Complete controlled browser acceptance, owner MFA/AAL2 and current commercial entitlement verification.'
   :certification==='PARTIAL'?'Resolve the reported soft degradation before relying on affected intelligence.'
   :'Resolve failed runtime gates before widening production load.',
  methodology:{baseline:'Bounded high-level observations; no full private QA fan-out.',
   market_data_soft_gate:'Market-data degradation stays PARTIAL when core runtime gates pass. It cannot grant trading permission.',
   source_freshness:'Original source timestamps and transport results determine gates; a new envelope cannot refresh old evidence.',
   provider_limit:'Provider-side rate limits are not inferred from internal health.',stress_policy:'No retries or aggressive polling.'}};
}
