// V333 · Command OS cloud write reduction.
// Pure and strictly conservative: an authenticated remote READ must complete
// before deciding which locally newer records may be sent as write intents.
// Supabase PostgREST can return a maximum of 1000 rows by default; a page at
// that limit is NOT complete proof of which IDs are absent. Hold, don't upsert.
export const V333_REMOTE_PAGE_BOUNDARY=1000;
export const V333_MAX_WRITE_ROWS=100;
export const V333_CLOCK_SKEW_MS=60_000;

export function v333PendingLocalChanges(localRows,remoteRows,{
 now=Date.now(),limit=V333_MAX_WRITE_ROWS
}={}){
 if(!Array.isArray(localRows)||!Array.isArray(remoteRows)||
    !Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||
    limit>V333_MAX_WRITE_ROWS)throw new Error('CLOUD_SYNC_INVALID_INPUT');
 if(remoteRows.length>=V333_REMOTE_PAGE_BOUNDARY)
  throw new Error('CLOUD_REMOTE_SNAPSHOT_PAGINATION_UNVERIFIED');
 const remote=new Map();
 for(const row of remoteRows){
  if(!row||typeof row.id!=='string'||!row.id.trim()||remote.has(row.id))
   throw new Error('CLOUD_REMOTE_ID_INVALID_OR_DUPLICATE');
  remote.set(row.id,row);
 }
 const seen=new Set(),pending=[];
 const parsed=(row)=>{
  const value=row?.updatedAt||row?.resolvedAt||row?.createdAt;
  if(typeof value!=='string'||!value.trim())return null;
  const n=Date.parse(value);
  if(!Number.isFinite(n)||n<=0||n>now+V333_CLOCK_SKEW_MS)return null;
  return n;
 };
 for(const row of localRows){
  if(!row||typeof row.id!=='string'||!row.id.trim()||seen.has(row.id))
   throw new Error('CLOUD_LOCAL_ID_INVALID_OR_DUPLICATE');
  seen.add(row.id);
  const remoteRow=remote.get(row.id);
  const localTime=parsed(row);
  if(!remoteRow){
   if(localTime===null)throw new Error('CLOUD_LOCAL_TIMESTAMP_UNVERIFIED');
   pending.push(row);
  }else{
   const remoteTime=parsed(remoteRow);
   // Never overwrite remote newer or equally timestamped records. We need
   // valid timestamps for BOTH sides before choosing local over remote.
   if(localTime!==null&&remoteTime!==null&&localTime>remoteTime)
    pending.push(row);
   else if(localTime!==null&&remoteTime===null)
    throw new Error('CLOUD_REMOTE_TIMESTAMP_UNVERIFIED');
  }
  if(pending.length>limit)
   throw new Error('CLOUD_DELTA_TOO_LARGE_REVIEW_REQUIRED');
 }
 return Object.freeze({
  pending:Object.freeze(pending.slice()),
  local_count:localRows.length,
  remote_count:remoteRows.length,
  would_write:pending.length,
  unchanged_or_remote_wins:localRows.length-pending.length,
  no_full_collection_replay:true,
  commercial_activation_permitted:false,
  trading_activation_permitted:false,
  capital_permission:'0R'
 });
}
