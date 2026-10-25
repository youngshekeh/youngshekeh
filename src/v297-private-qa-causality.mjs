// V297: causal QA attribution from an already fetched *complete* private QA response.
// This is display-only. It cannot certify a private runtime, OIDC, billing or trading.
const notCertified=(kind,summary)=>Object.freeze({
  kind,summary,certified:false,commercial_launch_allowed:false,capital_permission:'0R'
});
const QA_SIZE_FLOOR=100;
const FAILURE_VALUE=/\bundefined\b|\bn\/a\b/i;
const asStatus=value=>Number.isInteger(value)?value:Number.isInteger(Number(value))?Number(value):0;
export function attributePrivateQaBlockers({admitted=false,result=null}={}){
 if(admitted!==true)return notCertified('NOT_REQUESTED','PRIVATE QA DEFERRED · NOT CERTIFIED');
 const response=result?.response;
 if(response?.ok!==true)return notCertified('TRANSPORT_UNVERIFIED','PRIVATE QA TRANSPORT UNVERIFIED · NOT CERTIFIED');
 const body=result?.data,tests=body?.tests,meta=body?.summary;
 if(!Array.isArray(tests)||tests.length<QA_SIZE_FLOOR||
  !Number.isInteger(meta?.total)||meta.total!==tests.length||
  !Number.isInteger(meta?.passed)||!Number.isInteger(meta?.failed)||
  meta.passed<0||meta.failed<0||meta.passed+meta.failed!==meta.total||
  body?.invariants?.capital_permission!=='0R'||
  tests.some(t=>!t||typeof t.name!=='string'||typeof t.pass!=='boolean')||
  tests.filter(t=>t.pass).length!==meta.passed||
  body?.version==='v78-unknown')
  return notCertified('MATRIX_NOT_VERIFIED','PRIVATE QA MATRIX NOT VERIFIED · NOT CERTIFIED');
 const probes=Array.isArray(body?.transport?.probes)?body.transport.probes:[];
 const found=new Map(probes.filter(p=>typeof p?.name==='string').map(p=>[p.name,p]));
 const mission=found.get('mission'),closure=found.get('productionClosure');
 const failing=tests.filter(t=>t.pass===false);
 const missingCount=failing.filter(t=>FAILURE_VALUE.test(String(t.detail||''))).length;
 const failCount=failing.length;
 const missionUnavailable=asStatus(mission?.status)===503;
 const closureUnavailable=asStatus(closure?.status)===503;
 const allTransportStarted=body?.transport?.incomplete===false
  &&body.transport.not_started_probes===0
  &&body.transport.deadline_aborted_probes===0;
 const observed=missionUnavailable?'MISSION SERVICE UNAVAILABLE':'MISSION SERVICE NOT VERIFIED';
 const parts=[
  `${meta.passed}/${meta.total} QA CHECKS`,
  `${failCount} FAILED`,
  `${missingCount} WITH MISSING VALUES`,
  observed,
  closureUnavailable?'CLOSURE SERVICE HTTP 503':'CLOSURE STATUS NOT VERIFIED',
  allTransportStarted?'TRANSPORT COMPLETE':'TRANSPORT NOT CERTIFIED',
  'NOT LAUNCH-CERTIFIED'
 ];
 return Object.freeze({
  kind:'REAL_MATRIX_FAILED',summary:parts.join(' · '),
  failed:failCount,missing_values:missingCount,total:meta.total,
  mission_http_503:missionUnavailable,closure_http_503:closureUnavailable,
  all_transport_started:allTransportStarted,certified:false,
  commercial_launch_allowed:false,capital_permission:'0R'
 });
}
