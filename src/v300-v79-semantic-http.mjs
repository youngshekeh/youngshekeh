// V300: internal Gold state engine HTTP transport must reflect its semantic state.
// One existing signed private upstream request, no additional requests or orders.
export const GOLD_STATE_OBSERVATION_MAX_AGE_MS=13*60*1000; // 10m capture + 3m margin
const SAFE_STATES=new Set(['LOAD_SHED_DB_RECOVERY','DATA_GATED','QUALITY_QUARANTINE','STALE_RESEARCH_SNAPSHOT']);
const HOLD=Object.freeze({ok:false,usable:false,action:'WAIT',capital_permission:'0R',
 live_order_submission_enabled:false,automatic_execution:false,
 engine_certified:false,market_data_current:false,
 commercial_launch_certified:false});
export function classifyGoldStateBridge({httpStatus=0,body=null,now=Date.now()}={}){
 const age=now-Date.parse(String(body?.observed_at||''));
 const complete=httpStatus===200&&body!==null&&typeof body==='object'
   &&!Array.isArray(body)&&body.ok===true&&body.usable!==false
   &&body.quality_state==='PASS'&&typeof body.version==='string'
   &&/^v79[-.]/.test(body.version)
   &&body.capital_permission==='0R'
   &&body.live_order_submission_enabled===false
   &&body.automatic_execution===false
   &&body.state!==null&&typeof body.state==='object'
   &&typeof body.state.phase==='string'
   &&typeof body.state.direction==='string'
   &&Number.isFinite(age)&&age>=0&&age<=GOLD_STATE_OBSERVATION_MAX_AGE_MS;
 if(complete)return Object.freeze({httpStatus:200,certifiedObservation:true,
   policy:'V300-OBSERVED-GOLD-STATE-RESEARCH-NOT-EXECUTION',
   payload:body});
 const sourceState=typeof body?.state==='string'&&SAFE_STATES.has(body.state)
   ?body.state:'PRIVATE_ENGINE_EVIDENCE_UNVERIFIED';
 return Object.freeze({httpStatus:503,certifiedObservation:false,
   policy:'V300-PRIVATE-GOLD-ENGINE-HOLD',
   payload:Object.freeze({...HOLD,version:'v300-private-gold-state-transport-truth-v1',
    state:sourceState,source_version:typeof body?.version==='string'?body.version.slice(0,100):null,
    upstream_http_status:Number.isInteger(httpStatus)?httpStatus:0,
    reason:'Private Gold state engine did not deliver current, signed, governance-valid research evidence',
    source_observed_at:typeof body?.observed_at==='string'?body.observed_at:null
   })});
}
