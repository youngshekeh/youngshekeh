/* V245 · Never infer a security seal from network reachability.
   Only a database-returned sealed=true is an acceptable result.
   Start REST after a short hedge delay when SQL stalls; settle both
   results when hedged so explicit negatives cannot be concealed.
*/
const missing=err=>String(err).includes('v180_kernel_security_seal_missing');
async function attempt(fn){
 try{
  const value=await fn();
  if(value?.sealed!==true)return {kind:'negative'};
  return {kind:'verified',value};
 }catch(error){
  return {kind:missing(error)?'negative':'transport'};
 }
}
export async function verifySealWithHedge({pooler,rest,hedgeDelayMs=2000}={}){
 if(typeof pooler!=='function'||typeof rest!=='function')throw new TypeError('seal_verifiers_required');
 const pool=attempt(pooler);
 let timer;
 const hedge=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),hedgeDelayMs)});
 const early=await Promise.race([pool,hedge]);
 clearTimeout(timer);
 if(early!==null){
  if(early.kind==='negative')throw new Error('v180_kernel_security_seal_missing');
  if(early.kind==='verified')return early.value;
  const fallback=await attempt(rest);
  if(fallback.kind==='negative')throw new Error('v180_kernel_security_seal_missing');
  if(fallback.kind==='verified')return fallback.value;
  throw new Error('DATABASE_SEAL_TRANSPORT_TIMEOUT');
 }
 const [sql,http]=await Promise.all([pool,attempt(rest)]);
 if(sql.kind==='negative'||http.kind==='negative')
   throw new Error('v180_kernel_security_seal_missing');
 if(sql.kind==='verified')return sql.value;
 if(http.kind==='verified')return http.value;
 throw new Error('DATABASE_SEAL_TRANSPORT_TIMEOUT');
}
