import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 v332BoundedSettled,v332BoundedMap,v332CreateScheduler,
 V332_RECUR_MS,V332_MACHINE_MS,V332_PHASE_START_MS,
 V332_PHASE_GAP_MS,V332_SOURCE_CONCURRENCY,
 V332_STARTUP_CONCURRENCY
} from '../src/v332-command-os-load-spreading.mjs';

const command=readFileSync(new URL('../src/command-os.js',import.meta.url),'utf8');
function gate(){let done;return{promise:new Promise(r=>{done=r;}),done:()=>done()};}
function stub(){
 const oneShots=[],recurs=[],cleared=[];
 let visible=true,active=0,maxActive=0,hits=[];
 const tasks=Array.from({length:12},(_,i)=>async()=>{
  hits.push('cloud:'+i);active++;maxActive=Math.max(active,maxActive);active--;
 });
 const opts={tasks,machineTask:async()=>{hits.push('machine')},
 visible:()=>visible,timeout:(fn,delay)=>{
  const e={fn,delay,id:oneShots.length};oneShots.push(e);return e;
 },interval:(fn,delay)=>{
  const e={fn,delay,id:recurs.length};recurs.push(e);return e;
 },clearTimeoutFn:t=>cleared.push(t),clearIntervalFn:t=>cleared.push(t)};
 const s=v332CreateScheduler(opts);
 return{opts,s,oneShots,recurs,cleared,hits,active:()=>active,
  maxActive:()=>maxActive,visibility:v=>{visible=v;}};
}
test('V332 phases 12 existing tasks across five minutes and retains one-minute machine cadence',()=>{
 const {oneShots,s}=stub();
 assert.equal(oneShots.length,13);
 assert.equal(oneShots[0].delay,60000);
 assert.deepEqual(oneShots.slice(1).map(x=>x.delay),
   Array.from({length:12},(_,i)=>310000+i*17000));
 assert.equal(oneShots.at(-1).delay,497000);
 assert.ok(oneShots.at(-1).delay<2*V332_RECUR_MS);
 assert.equal(s.state().capital_permission,'0R');
 assert.equal(s.state().payments_enabled,false);
 assert.equal(s.state().live_trading_enabled,false);
});
test('scheduled callback runs in its phase, then repeats at five minutes',async()=>{
 const x=stub();
 x.oneShots[2].fn();
 await Promise.resolve();
 assert.deepEqual(x.hits,['cloud:1']);
 assert.equal(x.recurs.length,1);
 assert.equal(x.recurs[0].delay,300000);
 x.recurs[0].fn();await Promise.resolve();
 assert.deepEqual(x.hits,['cloud:1','cloud:1']);
});
test('machine heartbeat update is never more frequent than original minute',async()=>{
 const x=stub();
 x.oneShots[0].fn();await Promise.resolve();
 assert.deepEqual(x.hits,['machine']);
 assert.equal(x.recurs.length,1);
 assert.equal(x.recurs[0].delay,60000);
 x.recurs[0].fn();await Promise.resolve();
 assert.deepEqual(x.hits,['machine','machine']);
});
test('hidden tab skips recurring cloud and kernel polling without stopping timers',async()=>{
 const x=stub();x.visibility(false);
 x.oneShots.forEach(t=>t.fn());
 await Promise.resolve();
 assert.equal(x.hits.length,0);
 assert.equal(x.recurs.length,13);
 x.visibility(true);
 x.recurs[0].fn();await Promise.resolve();
 assert.deepEqual(x.hits,['machine']);
});
test('disposing module cancels all timers and prevents callback from resuming',async()=>{
 const x=stub();x.oneShots.forEach(t=>t.fn());
 await Promise.resolve();
 x.s.dispose();
 assert.equal(x.s.state().disposed,true);
 assert.equal(x.cleared.length,26);
 const before=x.hits.length;
 x.recurs.forEach(t=>t.fn());await Promise.resolve();
 assert.equal(x.hits.length,before);
 x.s.dispose();assert.equal(x.cleared.length,26);
});
test('a single task cannot overlap its own unresolved request',async()=>{
 let n=0;const wait=gate();
 const x=stub();
 x.opts.tasks[0]=async()=>{n++;await wait.promise;};
 // scheduler captures functions when constructed; set a fresh scheduler
 const y=stub();
 const vals={...y.opts,tasks:[x.opts.tasks[0],...y.opts.tasks.slice(1)]};
 const q=v332CreateScheduler(vals);
 y.oneShots.at(-12).fn();
 await Promise.resolve();
 assert.equal(n,1);
 y.recurs.at(-1).fn();
 await Promise.resolve();
 assert.equal(n,1);
 wait.done();await Promise.resolve();
 q.dispose();
});
test('global scheduled task fanout never exceeds two concurrent requests',async()=>{
 const blocks=Array.from({length:3},gate);
 let n=0;
 const x=stub();
 const tasks=x.opts.tasks.map((fn,i)=>i<3?async()=>{n++;await blocks[i].promise}:fn);
 const y=stub();
 const scheduler=v332CreateScheduler({...y.opts,tasks});
 // activate first three cloud tasks at once
 // The first 13 timers belong to stub()'s own scheduler; the second
 // batch of 13 timers belongs to the specially instrumented scheduler.
 y.oneShots[14].fn();y.oneShots[15].fn();y.oneShots[16].fn();
 await Promise.resolve();
 assert.equal(n,2);
 blocks[0].done();blocks[1].done();blocks[2].done();
 // The scheduler releases each async slot in a finally continuation.
 // Flush all queued promise jobs, not merely the first microtask.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(scheduler.state().active,0);
 scheduler.dispose();
});
test('bounded-settled startup never creates a 13-request burst',async()=>{
 const gates=Array.from({length:6},gate);
 let started=0,active=0,max=0;
 const tasks=gates.map(x=>async()=>{
  started++;active++;max=Math.max(max,active);
  await x.promise;active--;
 });
 const work=v332BoundedSettled(tasks,2);
 await Promise.resolve();
 assert.equal(started,2);
 gates.forEach(x=>x.done());
 const done=await work;
 assert.equal(done.length,6);
 assert.equal(max,2);
 assert.ok(done.every(x=>x.status==='fulfilled'));
});
test('startup exceptions remain isolated and later sync tasks still run',async()=>{
 const out=await v332BoundedSettled([
 async()=>1,async()=>{throw Error('temporary outage')},
 async()=>3
 ],2);
 assert.deepEqual(out.map(x=>x.status),['fulfilled','rejected','fulfilled']);
});
test('bounded source fetch maintains source order and at most two in-flight requests',async()=>{
 let active=0,max=0;
 const out=await v332BoundedMap([1,2,3,4,5,6,7],async n=>{
  active++;max=Math.max(active,max);
  await Promise.resolve();active--;return [n,n*2];
 },2);
 assert.equal(max,2);
 assert.deepEqual(out,[[1,2],[2,4],[3,6],[4,8],[5,10],[6,12],[7,14]]);
});
test('source fetch fails closed on rejected task without unhandled work',async()=>{
 await assert.rejects(()=>v332BoundedMap([1,2,3],
  async n=>{if(n===2)throw Error('provider unavailable');return n},2),
  /provider unavailable/);
});
test('bounded helpers reject excessive parallelism and invalid configuration',async()=>{
 await assert.rejects(()=>v332BoundedSettled([],20),/INVALID_BOUNDED_TASKS/);
 await assert.rejects(()=>v332BoundedMap([],null,2),/INVALID_MAP/);
 assert.throws(()=>v332CreateScheduler({tasks:[],machineTask:async()=>{}}),
  /V332_SCHEDULER_CONFIG_INVALID/);
});
test('Command OS actually uses 7-source capped fetch instead of unbounded Promise.all',()=>{
 assert.match(command,/v332BoundedMap\(SOURCE_DEFS/);
 assert.match(command,/V332_SOURCE_CONCURRENCY/);
 assert.equal(V332_SOURCE_CONCURRENCY,2);
 assert.doesNotMatch(command,/Promise\.all\(SOURCE_DEFS\.map/);
});
test('Command OS startup now limits all cloud task syncs and preserves executive cycle',()=>{
 assert.match(command,/v332BoundedSettled\(\[syncMachine,\.\.\.periodicCloudTasks\]/);
 assert.match(command,/V332_STARTUP_CONCURRENCY/);
 assert.match(command,/\.then\(\(\)=>void runExecutiveCycle\(\)\)/);
 assert.equal(V332_STARTUP_CONCURRENCY,2);
 assert.equal((command.match(/syncCloudMemory,syncOrganization/g)||[]).length,1);
});
test('Command OS background visibility and existing manual controls remain intact',()=>{
 assert.match(command,/visible:\(\)=>document.visibilityState!=='hidden'/);
 assert.match(command,/byId\('refresh-command'\)\?\.addEventListener\('click',syncMachine\)/);
 assert.match(command,/byId\('sync-cloud'\)\?\.addEventListener\('click',\(\)=>void syncCloudMemory\(\)\)/);
 assert.match(command,/syncKernelConsole/);
 assert.doesNotMatch(command,/setInterval\(\(\)=>void syncKernelConsole\(\),300000\)/);
});
test('no merchant charges, automatic trading, database cron or secrets added',()=>{
 const src=readFileSync(new URL('../src/v332-command-os-load-spreading.mjs',
  import.meta.url),'utf8');
 assert.doesNotMatch(src,/\bfetch\(|\.insert\(|cron\.schedule|placeOrder|order_send|payments\.charge|service_role/i);
 // An internal Set.delete() used to release a concurrency slot is not
 // a database DELETE and must remain allowed.
 assert.match(src,/capital_permission:'0R'/);
 assert.match(src,/payments_enabled:false/);
 assert.match(src,/live_trading_enabled:false/);
});
