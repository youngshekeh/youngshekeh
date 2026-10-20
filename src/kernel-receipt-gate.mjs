// V216: a private kernel HTTP 200 is not evidence of successful scheduled work.
// Exact, recent, owner-counted, fail-closed receipts are mandatory.
const MAX_AGE_MS=2*60*1000;
const MIN_PROCESSING_OWNERS=1;
const MAX_PROCESSING_OWNERS=20;
const VERIFIED_TRANSPORTS=new Set(['SQL_POOLER_VERIFIED','POSTGREST_VERIFIED']);
export function certifyKernelReceipt(body,now=Date.now()){
  function reject(reason,counts={}){
    return Object.freeze({verified:false,reason,counts:Object.freeze(counts)});
  }
  if(body?.ok!==true)return reject('KERNEL_NOT_OK');
  const date=Date.parse(String(body?.generated_at||''));
  if(!Number.isFinite(date)||date>now+60000||now-date>MAX_AGE_MS)
    return reject('STALE_OR_MISSING_TIMESTAMP');
  if(body?.seal?.sealed!==true||!VERIFIED_TRANSPORTS.has(body?.seal?.transport))
    return reject('SEAL_NOT_VERIFIED');
  const g=body?.governance;
  if(g?.internal_execution_only!==true||g?.external_execution!==false
    ||g?.action_permitted!=='WAIT'||g?.capital_permission!=='0R'
    ||g?.funds_moved!==false||g?.trades_sent!==false
    ||g?.human_approval_bypassed!==false)
    return reject('CAPITAL_GOVERNANCE_NOT_VERIFIED');
  const owners=body.owners_processed;
  if(!Number.isInteger(owners)||owners<MIN_PROCESSING_OWNERS||owners>MAX_PROCESSING_OWNERS)
    return reject('OWNER_COUNT_INVALID');
  const runs=body.runs;
  if(!Array.isArray(runs)||runs.length!==owners)
    return reject('RUN_OWNER_COUNT_MISMATCH',{owners,runs:Array.isArray(runs)?runs.length:0});
  const seen=new Set();
  for(const r of runs){
    // Skip/overlap, retry-backoff, dead-letter hold or failed dispatch cannot
    // become a green heartbeat merely because the Edge endpoint returned 200.
    if(r?.status!=='SUCCEEDED'||r?.mode!=='EXECUTE'||r?.health_state!=='HEALTHY')
      return reject('OWNER_RUN_NOT_HEALTHY',{owners,certified:seen.size});
    const id=String(r?.run_id??'');
    if(!id||id.length>128||seen.has(id))
      return reject('RUN_RECEIPT_ID_INVALID',{owners,certified:seen.size});
    seen.add(id);
  }
  return Object.freeze({verified:true,reason:'EXECUTED_AND_VERIFIED',counts:Object.freeze({owners,successful_runs:seen.size})});
}
