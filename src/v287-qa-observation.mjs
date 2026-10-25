// V287: distinguish a private QA transport failure from a completed QA matrix.
// Presentation only. The existing strict launch-readiness gate remains authoritative.
export function describeQaObservation({admitted=false,result=null}={}) {
  const notCertified=(kind,label)=>Object.freeze({kind,label,certified:false});
  if(admitted!==true){
    return notCertified('DEFERRED','DEFERRED · NOT CERTIFIED');
  }
  const response=result?.response;
  const data=result?.data;
  // A 503 (including a JSON body with a stale score) must never be reported as
  // a real matrix result. A missing response is also a transport failure.
  if(response?.ok!==true){
    const status=Number(response?.status);
    const code=Number.isInteger(status)&&status>=400&&status<=599?status:0;
    return notCertified('TRANSPORT_UNAVAILABLE',
      code?`PRIVATE QA HTTP ${code} · NOT CERTIFIED`:
        'PRIVATE QA TRANSPORT UNVERIFIED · NOT CERTIFIED');
  }
  const summary=data?.summary;
  const passed=summary?.passed,failed=summary?.failed,total=summary?.total;
  const valid=Number.isInteger(passed)&&Number.isInteger(failed)&&
    Number.isInteger(total)&&passed>=0&&failed>=0&&
    total>1&&total===passed+failed;
  // Historical v78-unknown 0/1 records represent a broken transport, NOT a
  // one-test replacement for the 107-check private certification.
  if(data?.version==='v78-unknown'||total===1){
    return notCertified('SYNTHETIC_TRANSPORT_RECORD',
      'QA TRANSPORT RECORD · NOT CERTIFIED');
  }
  if(data?.ok===true&&valid){
    return notCertified('MATRIX_UNCERTIFIED',
      `QA ${passed}/${total} · NOT CERTIFIED`);
  }
  return notCertified('UNVERIFIED_PAYLOAD',
    'PRIVATE QA EVIDENCE INCOMPLETE · NOT CERTIFIED');
}
