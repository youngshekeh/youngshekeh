import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePaperQuote,createPaperQuoteSubmitter,paperQuoteMessage} from '../src/owner-paper-quote.mjs';

const now=Date.parse('2026-10-01T19:20:00Z');
const quote={mode:'PAPER_DEMO',asset:'XAUUSD',provenance:'BROKER_DEMO_USER_SUPPLIED',source_code:'DEMO_01',provider_symbol:'XAUUSDm',sequence:1,observed_at:'2026-10-01T19:19:59.500Z',bid:4000,ask:4000.2};
const receipt={ok:true,mode:'PAPER_DEMO',capital_permission:'0R',execution_grade:false,broker_verified:false,live_order_submission_enabled:false,state:'PAPER_QUOTE_RECORDED',inserted:true,receipt_id:12,governance:{capital_permission:'0R',action_permitted:'WAIT',live_order_submission_enabled:false,paper_quotes_can_unlock_capital:false}};
const text=q=>JSON.stringify(q);

test('valid demo quote preserves source values without adding identity or credentials',()=>{
  const result=preparePaperQuote(text({...quote,broker_verified:false}),now);
  assert.equal(result.ok,true); assert.deepEqual(result.quote,quote);
});
test('explicit timezone represents the same source observation',()=>{
  assert.equal(preparePaperQuote(text({...quote,observed_at:'2026-10-01T20:19:59.500+01:00'}),now).ok,true);
});
test('quote expires exactly at ten seconds',()=>{
  assert.equal(preparePaperQuote(text(quote),now+9499).ok,true);
  assert.equal(preparePaperQuote(text(quote),now+9500).error,'stale_quote');
});
for(const [name,change,error] of [
  ['live mode',{mode:'LIVE'},'paper_boundary_required'],
  ['wrong asset',{asset:'GC=F'},'paper_boundary_required'],
  ['unverified provenance claim',{provenance:'BROKER_VERIFIED'},'paper_boundary_required'],
  ['verified broker flag',{broker_verified:true},'paper_boundary_required'],
  ['string false flag',{execution_grade:'false'},'paper_boundary_required'],
  ['live orders flag',{live_order_submission_enabled:true},'paper_boundary_required'],
  ['credentials field',{api_key:'should-never-leave-browser'},'unexpected_fields'],
  ['owner substitution',{owner_user_id:'other-user'},'unexpected_fields'],
  ['unsafe source',{source_code:'demo!'},'invalid_source_or_symbol'],
  ['wrong provider symbol',{provider_symbol:'EURUSD'},'invalid_source_or_symbol'],
  ['fractional sequence',{sequence:1.5},'invalid_sequence'],
  ['zero sequence',{sequence:0},'invalid_sequence'],
  ['unsafe sequence',{sequence:9007199254740992},'invalid_sequence'],
  ['text price',{bid:'4000'},'invalid_bid_ask'],
  ['zero price',{bid:0},'invalid_bid_ask'],
  ['crossed price',{ask:3999},'invalid_bid_ask'],
  ['excessive spread',{ask:4081},'invalid_bid_ask'],
  ['missing timezone',{observed_at:'2026-10-01T19:19:59.500'},'invalid_timestamp'],
  ['invalid timestamp',{observed_at:'not-a-time'},'invalid_timestamp'],
  ['future timestamp',{observed_at:'2026-10-01T19:20:00.001Z'},'future_quote'],
]) test(name,()=>assert.equal(preparePaperQuote(text({...quote,...change}),now).error,error));
for(const value of ['broken','null','[]','1']) test('non-object JSON '+value,()=>assert.equal(preparePaperQuote(value,now).error,'invalid_json'));
test('body byte size includes multibyte characters',()=>assert.equal(preparePaperQuote('界'.repeat(6000),now).error,'body_too_large'));
test('invalid clock cannot validate freshness',()=>assert.equal(preparePaperQuote(text(quote),NaN).error,'invalid_timestamp'));

function setup({session={token:'verified-session',owner:true,mfa:true},send=async()=>receipt}={}) {
  let current=session; const calls=[];
  const submitter=createPaperQuoteSubmitter({getSession:()=>current,now:()=>now,send:async q=>{calls.push(q);return send(q);}});
  return {submitter,calls,setSession:value=>{current=value;}};
}
for (const session of [null,{token:'a',owner:false,mfa:true},{token:'a',owner:true,mfa:false}]) test('locked session cannot send '+JSON.stringify(session),async()=>{
  const ctx=setup({session}); assert.equal((await ctx.submitter.submit(text(quote))).error,'owner_mfa_required');assert.equal(ctx.calls.length,0);
});
test('invalid quote makes no network request',async()=>{
  const ctx=setup(); assert.equal((await ctx.submitter.submit(text({...quote,api_key:'secret'}))).error,'unexpected_fields');assert.equal(ctx.calls.length,0);
});
test('one valid quote obtains an intake-only receipt',async()=>{
  const ctx=setup();const result=await ctx.submitter.submit(text(quote));
  assert.equal(result.ok,true); assert.equal(result.receipt_id,12);assert.equal(result.observed_at,quote.observed_at);
  assert.equal(result.expires_at,'2026-10-01T19:20:09.500Z');assert.deepEqual(ctx.calls,[quote]);
});
test('identical replay receipt does not claim a new insertion',async()=>{
  const ctx=setup({send:async()=>({...receipt,state:'DUPLICATE_ALREADY_RECORDED',inserted:false})});
  assert.equal((await ctx.submitter.submit(text(quote))).inserted,false);
});
test('overlapping clicks send only one request',async()=>{
  let complete;const ctx=setup({send:()=>new Promise(resolve=>{complete=resolve;})});
  const first=ctx.submitter.submit(text(quote));
  assert.equal((await ctx.submitter.submit(text(quote))).error,'busy');
  assert.equal(ctx.calls.length,1);complete(receipt);assert.equal((await first).ok,true);
});
test('session replacement during request withholds the old receipt',async()=>{
  let complete;const ctx=setup({send:()=>new Promise(resolve=>{complete=resolve;})});
  const result=ctx.submitter.submit(text(quote));ctx.setSession({token:'new-session',owner:true,mfa:true});complete(receipt);
  assert.equal((await result).error,'session_changed');
});
for (const change of [
  {broker_verified:true},{capital_permission:'1R'},{live_order_submission_enabled:true},
  {receipt_id:0},{inserted:false},{governance:{...receipt.governance,action_permitted:'BUY'}},
]) test('unsafe or malformed receipt '+JSON.stringify(change),async()=>{
  const ctx=setup({send:async()=>({...receipt,...change})});assert.equal((await ctx.submitter.submit(text(quote))).error,'unverified_receipt');
});
test('failed response makes no automatic retry and releases the busy lock',async()=>{
  let count=0;const ctx=setup({send:async()=>{count++;throw {data:{error:'paper_intake_rate_limit'}};}});
  assert.equal((await ctx.submitter.submit(text(quote))).error,'paper_intake_rate_limit');assert.equal(count,1);
  assert.equal((await ctx.submitter.submit(text(quote))).error,'paper_intake_rate_limit');assert.equal(count,2);
});
test('ambiguous network outcome never reports success',async()=>{
  const ctx=setup({send:async()=>{throw new Error('connection lost');}});
  assert.equal((await ctx.submitter.submit(text(quote))).error,'transport_unavailable');assert.equal(ctx.calls.length,1);
});
test('untrusted errors are replaced by a fixed display message',()=>assert.equal(paperQuoteMessage('<script>credentials</script>'),paperQuoteMessage('unknown')));
