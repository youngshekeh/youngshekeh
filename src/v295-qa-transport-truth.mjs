// V295: classify scheduled private QA evidence without manufacturing a one-test matrix.
// This is a transport/audit classifier, NOT a private QA certification or release gate.
const FULL_QA_MIN=100;
const QA_STATES=new Set(['PASS','FAIL','DEGRADED','INCOMPLETE']);
const integer=x=>Number.isInteger(x)&&x>=0&&x<=9999;
const unavailable=(httpStatus,timedOut)=>Object.freeze({
  kind:'QA_TRANSPORT_UNVERIFIED',insert_qa_matrix:false,certified:false,
  incident_severity:'critical',incident_state:'open',http_status:Number.isInteger(httpStatus)?httpStatus:null,
  timed_out:timedOut===true,capital_permission:'0R',commercial_launch_allowed:false
});
export function classifyScheduledPrivateQa({httpStatus=null,timedOut=false,body=null}={}){
  if(httpStatus!==200||timedOut===true||!body||typeof body!=='object'||Array.isArray(body))
    return unavailable(httpStatus,timedOut);
  const s=body.summary,tests=body.tests;
  if(typeof body.version!=='string'||!/^v\d/.test(body.version)||body.version==='v78-unknown'
    ||!QA_STATES.has(body.state)||!Array.isArray(tests)||tests.length<FULL_QA_MIN
    ||tests.length>1000||!s||typeof s!=='object'||!integer(s.total)||!integer(s.passed)
    ||!integer(s.failed)||s.total!==tests.length||s.passed+s.failed!==s.total
    ||body.invariants?.capital_permission!=='0R')
    return unavailable(httpStatus,timedOut);
  let yes=0,no=0;
  for(const t of tests){
    if(t===null||typeof t!=='object'||Array.isArray(t)||typeof t.name!=='string'
      ||!t.name||typeof t.pass!=='boolean')return unavailable(httpStatus,timedOut);
    if(t.pass)yes++;else no++;
  }
  if(yes!==s.passed||no!==s.failed||(body.state==='PASS'&&(!body.ok||s.failed!==0)))
    return unavailable(httpStatus,timedOut);
  return Object.freeze({
    kind:'COMPLETE_QA_MATRIX',insert_qa_matrix:true,certified:false,
    passed:s.passed,failed:s.failed,total:s.total,
    incident_state:body.state==='PASS'&&s.failed===0?'cleared':'open',
    incident_severity:body.state==='PASS'&&s.failed===0?'watch':
      s.failed<=2?'important':'critical',
    capital_permission:'0R',commercial_launch_allowed:false
  });
}
