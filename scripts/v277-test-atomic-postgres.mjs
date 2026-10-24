#!/usr/bin/env node
// V277 isolated PostgreSQL 16 integration. Never connects to Supabase or Flutterwave.
// Run only against local temporary CI service with v277-isolated-test database.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const database=process.env.PGDATABASE;
if(database!=='v277_isolated_test'||process.env.PGHOST!=='127.0.0.1'){
 console.error('V277 SAFETY REFUSAL: requires disposable localhost PGDATABASE=v277_isolated_test');
 process.exit(2);
}
const base=['-X','-v','ON_ERROR_STOP=1','-A','-t','-q'];
function psql(query,{failure=false}={}){
 try{
  const result=execFileSync('psql',[...base,'-c',query],{cwd:root,encoding:'utf8',
   timeout:25000,env:process.env,stdio:['ignore','pipe','pipe']}).trim();
  if(failure)throw Error('Expected SQL to reject but it succeeded');
  return result;
 }catch(e){
  if(!failure)throw Error('Unexpected PostgreSQL failure: '+String(e.stderr||e.message).slice(0,600));
  if(e.message==='Expected SQL to reject but it succeeded')throw e;
  return 'REJECTED';
 }
}
function setup(file){
 execFileSync('psql',[...base,'-f',file],{cwd:root,timeout:45000,
  env:process.env,stdio:'inherit'});
}
const uid=id=>'00000000-0000-0000-0000-'+String(id).padStart(12,'0');
const future=new Date(Date.now()+30*86400_000).toISOString();
function checkout(ref,user,plan,amount){
 psql("INSERT INTO public.checkout_intents(user_id,plan_id,provider,provider_reference,amount,currency,status) VALUES ('"+
   uid(user)+"','"+plan+"','flutterwave','"+ref+"',"+amount+",'USD','created')");
}
function call(id,ref,user,plan,amount,event,term=future){
 return "SELECT public.fulfill_verified_flutterwave_checkout_v276("+
 "'"+id+"','"+event+"','"+ref+"','"+uid(user)+"','"+plan+"',"+amount+
 ",'USD','successful',now(),'"+term+"','cust-"+user+"','sub-"+user+"')";
}
function scalar(q){return psql(q).split('\n').at(-1).trim()}
function assertCount(q,n){assert.equal(Number(scalar(q)),n,q)}
function note(message){console.log('V277 PostgreSQL PASS | '+message)}
setup('tests/fixtures/v277-postgres-schema.sql');
setup('docs/operations/candidates/v276-atomic-fulfillment-candidate.sql');
note('actual PostgreSQL 16 parsed and created unmodified V276 SQL candidate');

// The function is private: default PUBLIC grant, anon and authenticated must be revoked.
for(const role of ['anon','authenticated']){
 assert.equal(scalar("SELECT has_function_privilege('"+role+"',p.oid,'EXECUTE') FROM pg_proc p WHERE p.proname='fulfill_verified_flutterwave_checkout_v276'"),'f');
}
assert.equal(scalar("SELECT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_proc p WHERE p.proname='fulfill_verified_flutterwave_checkout_v276'"),'t');
assert.equal(scalar("SELECT prosecdef FROM pg_proc WHERE proname='fulfill_verified_flutterwave_checkout_v276'"),'t');
note('database-level EXECUTE privileges, SECURITY DEFINER, role restrictions');

// Baseline signed-and-provider-verified TEST receipt is simulated, not a real payment.
checkout('r-success',1,'pro',29);
assert.match(psql(call('tx-success','r-success',1,'pro',29,'event-success')),/ATOMICALLY_COMMITTED/);
assertCount("SELECT count(*) FROM public.payment_events WHERE user_id='"+uid(1)+"'",1);
assertCount("SELECT count(*) FROM public.checkout_intents WHERE provider_reference='r-success' AND status='paid'",1);
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(1)+"' AND status='active' AND current_period_end>now()",1);
note('same SQL function atomically writes event, paid intent and future entitlement');

// Same event, same transaction, or alternate event ID for same transaction: no extension.
assert.match(psql(call('tx-success','r-success',1,'pro',29,'event-success')),/ALREADY_COMMITTED_NOOP/);
assert.match(psql(call('tx-success','r-success',1,'pro',29,'new-event-id')),/ALREADY_COMMITTED_NOOP/);
assertCount("SELECT count(*) FROM public.payment_events WHERE user_id='"+uid(1)+"'",1);
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(1)+"'",1);
note('identical signed callback and alternate event-key replay are side-effect-free');

// Customer and amount mismatch fail before any ledger/event write.
checkout('r-invalid',3,'pro',29);
psql(call('tx-invalid','r-invalid',3,'pro',89,'event-invalid'),{failure:true});
assertCount("SELECT count(*) FROM public.payment_events WHERE user_id='"+uid(3)+"'",0);
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(3)+"'",0);
note('amount mismatch rejects and leaves database unchanged');

// Inject a failure AFTER inserting the event: entire function must roll back.
psql("CREATE FUNCTION public.v277_reject_paid() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.provider_reference='r-fail' AND NEW.status='paid' THEN RAISE EXCEPTION 'V277_FAIL_AFTER_PAYMENT_EVENT_INSERT'; END IF; RETURN NEW; END; $$");
psql("CREATE TRIGGER v277_fail_after_event BEFORE UPDATE ON public.checkout_intents FOR EACH ROW EXECUTE FUNCTION public.v277_reject_paid()");
checkout('r-fail',4,'pro',29);
psql(call('tx-fail','r-fail',4,'pro',29,'event-fail'),{failure:true});
assertCount("SELECT count(*) FROM public.payment_events WHERE user_id='"+uid(4)+"'",0);
assertCount("SELECT count(*) FROM public.checkout_intents WHERE provider_reference='r-fail' AND status='created'",1);
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(4)+"'",0);
note('injected failure after event insert: event, checkout and member all rolled back');

// Legacy prior event without committed_v276 marker must NOT grant anything.
checkout('r-legacy',5,'pro',29);
psql("INSERT INTO public.payment_events(provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload) VALUES ('flutterwave','old-key','charge.completed','"+uid(5)+"','pro',29,'USD','successful','{\"transaction_id\":\"tx-legacy\"}'::jsonb)");
psql(call('tx-legacy','r-legacy',5,'pro',29,'old-key'),{failure:true});
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(5)+"'",0);
assertCount("SELECT count(*) FROM public.checkout_intents WHERE provider_reference='r-legacy' AND status='created'",1);
note('old incomplete payment event forces explicit reconciliation, never auto-extends');

// Two simultaneous payment events for same user but DIFFERENT plans/references.
// Existing partial unique checkout index forbids two open checkouts on same plan;
// pro + executive deliberately satisfy existing database unique index.
checkout('r-race-pro',6,'pro',29);
checkout('r-race-exec',6,'executive',89);
function spawnPsql(sql){
 return new Promise(resolve=>{
  const proc=spawn('psql',[...base,'-c',sql],{cwd:root,env:process.env});
  let out='',err='';
  proc.stdout.on('data',b=>{out+=b.toString()});
  proc.stderr.on('data',b=>{err+=b.toString()});
  proc.on('error',e=>resolve({exit:-1,out,err:String(e)}));
  proc.on('close',exit=>resolve({exit,out,err}));
 });
}
const first=spawnPsql('BEGIN; '+call('tx-race-pro','r-race-pro',6,'pro',29,'event-race-pro')+
 '; SELECT pg_sleep(2); COMMIT;');
await new Promise(resolve=>setTimeout(resolve,600));
const second=spawnPsql(call('tx-race-exec','r-race-exec',6,'executive',89,'event-race-exec'));
const [one,two]=await Promise.all([first,second]);
assert.equal(one.exit,0,'first PostgreSQL transaction must commit: '+one.err.slice(0,350));
assert.notEqual(two.exit,0,'raced same-term conflicting transaction must fail');
assertCount("SELECT count(*) FROM public.payment_events WHERE user_id='"+uid(6)+"'",1);
assertCount("SELECT count(*) FROM public.checkout_intents WHERE user_id='"+uid(6)+"' AND status='paid'",1);
assertCount("SELECT count(*) FROM public.checkout_intents WHERE user_id='"+uid(6)+"' AND status='created'",1);
assertCount("SELECT count(*) FROM public.subscriptions WHERE user_id='"+uid(6)+"' AND current_period_end>now()",1);
note('TWO REAL concurrent PostgreSQL sessions: 1 commit, 1 rejected, 0 phantom entitlements');
console.log('V277 RESULT: 7 independent PostgreSQL integration scenarios passed in a disposable runner; no provider or Supabase requests');
