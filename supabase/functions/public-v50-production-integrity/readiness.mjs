import {sourceCurrent,incidentObservation,sourceEvidence,cacheLifetime} from '../_shared/public-launch-observation.mjs';
export const INTEGRITY_PATHS=Object.freeze(['public-runtime-beacon','public-app-config','public-data-plane-matrix',
 'public-v63-structural-core-fabric','public-v69-database-incident-shield']);
export function integrityCacheTtl(body){return cacheLifetime(body,body.state==='RUNTIME_READY'?120000:60000);}
export function assembleProductionIntegrity(records,now=Date.now()){
 const [runtime,config,data,core,incident]=INTEGRITY_PATHS.map(path=>records[path]);
 const d=data?.body??{},k=core?.body??{},db=incidentObservation(incident,now);
 const edge=sourceCurrent(runtime,now)&&runtime.body.edge_runtime==='ONLINE'&&sourceCurrent(config,now);
 const marketTransport=sourceCurrent(core,now);
 const reported=k.structure_signals?.market_status;
 const marketState=marketTransport&&typeof reported==='string'&&reported.trim()
  ?reported.trim().toUpperCase():'UNVERIFIED';
 const market=marketTransport&&!['UNAVAILABLE','UNKNOWN','STALE','UNVERIFIED'].includes(marketState);
 const currentData=sourceCurrent(data,now);
 const targets=['reports','gold_snapshots','market_snapshots','agent_runs','profiles'];
 const complete=currentData&&d.state==='ONLINE'&&d.total_checks===5&&d.readable_count===5
  &&Array.isArray(d.checks)&&d.checks.length===5
  &&targets.every(key=>d.checks.some(row=>row.key===key&&row.ok===true&&row.http_status>=200&&row.http_status<300
   &&Number.isInteger(row.row_sample_count)&&row.row_sample_count>=0&&row.row_sample_count<=1))
  &&d.critical?.gold_snapshot_table===true&&d.critical?.market_snapshot_table===true&&d.critical?.agent_run_ledger===true;
 const dataState=!currentData?'UNVERIFIED':d.state==='ONLINE'&&!complete?'DATA_RECEIPT_UNVERIFIED':(d.state??'UNVERIFIED');
 let state='DEGRADED';
 if(db.active===true)state='DATABASE_INCIDENT_HOLD';
 else if(db.active!==false)state='DATABASE_INCIDENT_UNVERIFIED';
 else if(edge&&market&&complete)state='RUNTIME_READY';
 else if(edge&&marketTransport&&!complete)state='RUNTIME_DEGRADED_DATA_PLANE';
 else if(edge&&marketTransport)state='RUNTIME_DEGRADED_MARKET_DATA';
 else if(edge)state='EDGE_ONLY';
 const gates=[
  {key:'database_incident',label:'V69 database incident shield',passed:db.active===false,state:db.state,
   detail:'Only a current successful PostgREST probe clears the incident.'},
  {key:'edge_runtime',label:'Public Edge runtime',passed:edge,state:edge?'ONLINE':'UNVERIFIED',
   detail:'Runtime beacon and app configuration must both return current evidence.'},
  {key:'market_core',label:'Governed structural market core',passed:market,state:marketState,
   detail:'Transport and semantic market availability remain separate.'},
  {key:'data_plane',label:'Canonical data plane',passed:complete,state:dataState,
   detail:'All five bounded relation-read receipts are independently required.'},
  {key:'auth',label:'Authentication runtime',passed:null,state:'UNVERIFIED_IN_SAFE_MODE',detail:'Auth stays off the hot integrity path.'},
  {key:'commercial',label:'Commercial acceptance',passed:null,state:'UNVERIFIED_IN_SAFE_MODE',detail:'Billing stays off the hot integrity path.'},
  {key:'governance',label:'Gold governance firewall',passed:true,state:'WAIT · 0R',detail:'Observations cannot grant trading permission.'}
 ];
 return {ok:true,version:'v50-production-integrity-v7-v262-source-safe',generated_at:new Date(now).toISOString(),state,
  database_incident:{active:db.active,code:db.code,verified:db.verified},
  interpretation:state==='RUNTIME_READY'?'Current Edge, market-core and data-plane observations pass.':
   state==='RUNTIME_DEGRADED_DATA_PLANE'?'The data-plane receipt is incomplete or unavailable.':
   state==='RUNTIME_DEGRADED_MARKET_DATA'?'The core is reachable; semantic market data is unavailable.':
   'One or more independent runtime observations remain unverified.',
  reachability:{reachable:INTEGRITY_PATHS.filter(path=>records[path]?.ok===true).length,total:5,
   probes:INTEGRITY_PATHS.map(path=>({path,reachable:records[path]?.ok===true,
    http_status:records[path]?.http_status??0,latency_ms:records[path]?.latency_ms??null}))},
  gates,unresolved:gates.filter(g=>g.passed===false).map(g=>g.key),source_evidence:sourceEvidence(records,now),
  core:{edge_online:edge,market_core_transport_online:marketTransport,market_core_online:market,
   market_core_state:marketState,data_plane_state:dataState,auth_state:'UNVERIFIED_IN_SAFE_MODE',commercial_state:'UNVERIFIED_IN_SAFE_MODE'},
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,
   rule:'Production integrity cannot grant trading permission.'},
  decision_compression:{what_changed:'All parent deadlines enclose their bounded dependencies.',
   what_matters:'Runtime layers and source times are evaluated independently.',what_is_permitted:`Platform ${state}. Gold WAIT · 0R.`},
  runtime_policy:{mode:'CONTROLLED_LOAD',cache_seconds:120,failed_cache_seconds:60,
   upstream_count:5,database_direct_reads:0,legacy_fanout:false,retries:false},
  methodology:{separation:'Runtime, data plane, Auth, commerce and trading remain separate.',
   fail_closed:'Missing or stale verification cannot clear a gate; unavailable data cannot be softened into market-only degradation.'}};
}
