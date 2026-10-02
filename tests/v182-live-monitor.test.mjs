import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMonitor, runBounded, marketAssetView} from '../src/live-monitor.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(refresh = async () => ({available:true})) {
  let clock = 0, visible = true, sequence = 0;
  const timers = new Map(), observations = [];
  const monitor = createLiveMonitor({refresh, now:() => clock, isVisible:() => visible,
    setTimer:(callback, delay) => {const id = ++sequence; timers.set(id,{callback,at:clock+delay}); return id;},
    clearTimer:id => timers.delete(id), onState:state => observations.push(state)});
  return {monitor, observations, timers,
    hide() {visible = false; monitor.visibilityChanged();},
    show() {visible = true; monitor.visibilityChanged();},
    async advance(ms) {
      const target = clock + ms;
      for (;;) {
        const next = [...timers.entries()].filter(([,t]) => t.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
        if (!next) break;
        clock = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      clock = target; await flush();
    }};
}

test('visible monitoring refreshes every minute after the last completed request', async () => {
  const reasons = []; const ctx = fixture(async reason => {reasons.push(reason); return {available:true};});
  await ctx.monitor.refresh('initial');
  await ctx.advance(59_999); assert.equal(reasons.length,1);
  await ctx.advance(1); assert.deepEqual(reasons,['initial','timer']);
  assert.equal(ctx.monitor.snapshot().lastSuccessAt,60_000);
});
test('manual, timer and visibility refreshes coalesce while a request is pending', async () => {
  let finish, calls = 0;
  const ctx = fixture(() => {calls++; return new Promise(resolve => {finish=resolve;});});
  const a = ctx.monitor.refresh('initial'); await flush();
  const b = ctx.monitor.refresh('manual'); assert.equal(a,b); assert.equal(calls,1);
  finish({available:true}); await a;
  assert.equal(ctx.timers.size,1); assert.equal(ctx.monitor.snapshot().busy,false);
});
test('failed reads do not advance successful refresh time or claim availability', async () => {
  let valid = true; const ctx = fixture(async () => ({available:valid}));
  await ctx.monitor.refresh(); valid=false; await ctx.advance(60_000);
  assert.equal(ctx.monitor.snapshot().lastSuccessAt,0);
  assert.equal(ctx.monitor.snapshot().available,false); assert.equal(ctx.monitor.snapshot().failures,1);
  assert.equal(ctx.timers.size,1);
});
test('transport exceptions are contained and the next scheduled check remains enabled', async () => {
  const ctx = fixture(async () => {throw new Error('fixture network failure');});
  await ctx.monitor.refresh(); assert.equal(ctx.monitor.snapshot().available,false);
  assert.equal(ctx.monitor.snapshot().busy,false); assert.equal(ctx.timers.size,1);
});
test('hidden pages stop network timers and refresh once when overdue on return', async () => {
  let calls=0; const ctx = fixture(async () => {calls++; return {available:true};});
  await ctx.monitor.refresh(); ctx.hide(); await ctx.advance(120_000);
  assert.equal(calls,1); assert.equal(ctx.timers.size,0);
  ctx.show(); await flush(); assert.equal(calls,2); assert.equal(ctx.timers.size,1);
});
test('returning before the minute boundary preserves the remaining interval', async () => {
  let calls=0; const ctx = fixture(async () => {calls++; return {available:true};});
  await ctx.monitor.refresh(); await ctx.advance(30_000); ctx.hide(); await ctx.advance(20_000); ctx.show();
  await ctx.advance(9_999); assert.equal(calls,1); await ctx.advance(1); assert.equal(calls,2);
});
test('a read finishing in a hidden page cannot restart polling', async () => {
  let finish; const ctx = fixture(() => new Promise(resolve => {finish=resolve;}));
  const pending=ctx.monitor.refresh(); await flush(); ctx.hide(); finish({available:true}); await pending;
  assert.equal(ctx.timers.size,0); assert.equal(ctx.monitor.snapshot().paused,true);
});
test('stopping the monitor prevents later network activity', async () => {
  let calls=0; const ctx = fixture(async () => {calls++; return {available:true};});
  await ctx.monitor.refresh(); ctx.monitor.stop(); await ctx.advance(180_000); await ctx.monitor.refresh();
  assert.equal(calls,1); assert.equal(ctx.timers.size,0);
});
test('background diagnostics stay at three active requests and contain per-engine failures', async () => {
  let active=0, peak=0;
  const results=await runBounded(Array.from({length:12},(_,i) => async () => {
    active++; peak=Math.max(peak,active); await flush(); active--;
    if (i===4) throw new Error('fixture diagnostic failure'); return i;
  }),99);
  assert.equal(peak,3); assert.equal(results.filter(Boolean).length,12);
  assert.equal(results[4].status,'rejected'); assert.equal(results[11].value,11);
});
test('hidden pages withhold queued diagnostics rather than starting another burst', async () => {
  let visible=true, calls=0;
  await runBounded(Array.from({length:20},() => async () => {calls++; visible=false; await flush();}),3,() => visible);
  assert.equal(calls,1);
});
test('stale or unavailable market snapshots cannot display an executable price', () => {
  for (const state of ['STALE','UNAVAILABLE','UNKNOWN','ERROR']) {
    const view=marketAssetView({key:'gold',price:4220,capital_permission:'1R'},state);
    assert.equal(view.price,null); assert.equal(view.permission,'0R');
  }
});
test('closed-session observations retain their price with an explicit closed state', () => {
  const view=marketAssetView({key:'bitcoin',price:60000,state:'BULLISH_CONFIRMED'},'MARKET_CLOSED');
  assert.equal(view.price,60000); assert.equal(view.state,'MARKET_CLOSED'); assert.equal(view.permission,'OBSERVATION ONLY');
});
test('malformed market prices stay withheld', () => {
  for (const price of [null,undefined,'4220',NaN,Infinity,-1,0]) {
    assert.equal(marketAssetView({label:'Gold',price},'DELAYED_LIVE').price,null);
  }
});
