// V330 kernel admission: fail-closed bounded load-shedding of recurring
// private database work after *observed failed private kernel attempts*.
// Per warm Vercel function isolate only, NOT a global DB mutex or permanent
// proof of infrastructure recovery. No network, SQL, cron or money operations.
export const V330_PRESSURE_SCHEMA='TFA-V330-KERNEL-CIRCUIT';
export function createKernelPressureCircuit({
 now=Date.now,threshold=2,failureWindowMs=15*60_000,
 cooldownMs=10*60_000,maxCooldownMs=30*60_000
}={}){
 if(typeof now!=='function'||!Number.isSafeInteger(threshold)||threshold<2
 ||!Number.isFinite(failureWindowMs)||failureWindowMs<60_000
 ||!Number.isFinite(cooldownMs)||cooldownMs<60_000
 ||!Number.isFinite(maxCooldownMs)||maxCooldownMs<cooldownMs)
 throw new TypeError('invalid_circuit_config');
 let attempts=[],until=0,level=0,inflight=false,probe=false;
 const inspect=()=>{
  const t=now();
  return Object.freeze({schema:V330_PRESSURE_SCHEMA,
   state:inflight?'ONE_PRIVATE_CALL_ACTIVE':until>t?'COOLDOWN':
      level>0?'RECOVERY_PROBE_AVAILABLE':'NORMAL',
   retry_after_seconds:until>t?Math.ceil((until-t)/1000):0,
   per_isolate_only:true,global_database_fix_certified:false,
   live_order_routing:false,commercial_activation_permitted:false,
   action:'WAIT',capital_permission:'0R'});
 };
 const acquire=()=>{
  const t=now();
  if(inflight)return Object.freeze({permitted:false,reason:'PRIVATE_INVOCATION_IN_PROGRESS',
    ...inspect()});
  if(t<until)return Object.freeze({permitted:false,reason:'DATABASE_PRESSURE_COOLDOWN',
    ...inspect()});
  inflight=true;
  probe=level>0;
  return Object.freeze({permitted:true,reason:probe?'BOUNDED_RECOVERY_PROBE':'NORMAL_INVOCATION',
    ...inspect()});
 };
 const release=({verified=false,backend_unavailable=false}={})=>{
  if(!inflight)return inspect();
  inflight=false;
  const t=now();
  if(verified===true){
   attempts=[];level=0;until=0;probe=false;
   return inspect();
  }
  if(backend_unavailable===true){
   attempts=attempts.filter(v=>t-v<=failureWindowMs);
   attempts.push(t);
   if(attempts.length>=threshold||probe){
    level=Math.min(4,level+1);
    until=t+Math.min(maxCooldownMs,cooldownMs*2**(level-1));
    attempts=[];probe=false;
   }
  }else if(probe){
   // A half-open attempt is not evidence of recovery without a
   // fresh sealed successful receipt. It must NOT reset the circuit.
   until=t+cooldownMs;probe=false;
  }
  return inspect();
 };
 return Object.freeze({acquire,release,inspect});
}
