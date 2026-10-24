#!/usr/bin/env node
// Run ONLY in disposable PostgreSQL 16 GitHub Actions database.
// Never uses Supabase, merchant APIs, customer data, or environment service keys.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='v278_isolated_test'){
 console.error('V278 REFUSAL: local disposable database only');process.exit(2);
}
const flags=['-X','-v','ON_ERROR_STOP=1','-A','-t','-q'];
const psql=(sql,{reject=false}={})=>{
 try{
  const out=execFileSync('psql',[...flags,'-c',sql],{cwd:root,encoding:'utf8',
   env:process.env,timeout:25000,stdio:['ignore','pipe','pipe']}).trim();
  if(reject)throw Error('EXPECTED_REJECTION_BUT_SUCCEEDED');
  return out;
 }catch(e){
  if(!reject||e.message==='EXPECTED_REJECTION_BUT_SUCCEEDED')
   throw Error('Unexpected SQL acceptance/rejection: '+String(e.stderr||e.message).slice(0,700));
  return 'REJECTED';
 }
};
const install=file=>execFileSync('psql',[...flags,'-f',file],
 {cwd:root,env:process.env,timeout:45000,stdio:'inherit'});
const user=id=>'00000000-0000-0000-0000-'+String(id).padStart(12,'0');
const now=Date.now(),start=new Date(now+15*86400000).toISOString(),
 end=new Date(now+45*86400000).toISOString(),later=new Date(now+75*86400000).toISOString();
function member(id,amount=29,plan='pro',status='active',term=start){
 psql("INSERT INTO public.subscriptions(user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end) "+
 "VALUES ('"+user(id)+"','"+plan+"','"+status+"','flutterwave','customer-"+id+"','subscription-"+id+"','"+term+"')");
}
function call(id,event,account,amount=29,cycleStart=start,cycleEnd=end,plan='pro',subid='subscription-'+account,custid='customer-'+account){
 return "SELECT public.fulfill_verified_flutterwave_renewal_v278('"+id+"','"+event+"','"+
 user(account)+"','"+plan+"','"+custid+"','"+subid+"',"+amount+
 ",'USD','successful',now(),'"+cycleStart+"','"+cycleEnd+"')";
}
const count=q=>Number(psql(q).split('\n').at(-1).trim());
const one=q=>psql(q).split('\n').at(-1).trim();
const note=s=>console.log('V278 PostgreSQL PASS | '+s);
install('tests/fixtures/v277-postgres-schema.sql');
install('docs/operations/candidates/v278-atomic-renewal-candidate.sql');
note('PostgreSQL 16 executed real renewal SQL candidate on isolated service');
for(const role of ['anon','authenticated']){
 assert.equal(one("SELECT has_function_privilege('"+role+"',p.oid,'EXECUTE') FROM pg_proc p WHERE p.proname='fulfill_verified_flutterwave_renewal_v278'"),'f');
}
assert.equal(one("SELECT has_function_privilege('service_role',p.oid,'EXECUTE') FROM pg_proc p WHERE p.proname='fulfill_verified_flutterwave_renewal_v278'"),'t');
note('execute grant restricted to service_role');

member(10);
assert.match(psql(call('tx-renew-10','event-renew-10',10)),/ATOMIC_RENEWAL_COMMITTED/);
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(10)+"'"),1);
assert.equal(one("SELECT current_period_end FROM public.subscriptions WHERE user_id='"+user(10)+"'")?.slice(0,10),end.slice(0,10));
note('renewal atomically inserts transaction event and extends actual period');

assert.match(psql(call('tx-renew-10','event-renew-10',10)),/ALREADY_COMMITTED_NOOP/);
assert.match(psql(call('tx-renew-10','event-renew-alt-key',10)),/ALREADY_COMMITTED_NOOP/);
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(10)+"'"),1);
note('same transaction / different event ID replay produces NOOP with no extension');

member(11);
psql(call('tx-mismatch-11','event-mismatch-11',11,89),{reject:true});
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(11)+"'"),0);
psql(call('tx-wrong-customer','event-wrong-customer',11,29,start,end,'pro','subscription-11','impostor'),{reject:true});
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(11)+"'"),0);
note('provider price and customer identity mismatch rejected');

member(12,29,'pro','canceled');
psql(call('tx-canceled','event-canceled',12),{reject:true});
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(12)+"'"),0);
note('canceled subscription cannot be silently renewed');

// Failure AFTER ledger insert: trigger intentionally raises on member term change.
member(13);
psql("CREATE FUNCTION public.v278_force_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.provider_subscription_id='subscription-13' THEN RAISE EXCEPTION 'V278_TEST_FAIL_AFTER_LEDGER_INSERT'; END IF; RETURN NEW; END; $$");
psql("CREATE TRIGGER v278_failure_trigger BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.v278_force_rollback()");
psql(call('tx-error-13','event-error-13',13),{reject:true});
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(13)+"'"),0);
assert.equal(one("SELECT current_period_end FROM public.subscriptions WHERE user_id='"+user(13)+"'").slice(0,10),start.slice(0,10));
note('injected failure AFTER payment event insert rolls back both writes');

member(14);
psql("INSERT INTO public.payment_events(provider,provider_event_key,event_type,user_id,plan_id,amount,currency,status,raw_payload) VALUES ('flutterwave','old-legacy-14','subscription.renewed','"+user(14)+"','pro',29,'USD','successful','{\"transaction_id\":\"old-tx-14\"}'::jsonb)");
psql(call('old-tx-14','old-legacy-14',14),{reject:true});
assert.equal(one("SELECT current_period_end FROM public.subscriptions WHERE user_id='"+user(14)+"'").slice(0,10),start.slice(0,10));
note('legacy partial event cannot extend term on retry');

member(15);
function asyncSql(query){
 return new Promise(resolve=>{
  const proc=spawn('psql',[...flags,'-c',query],{cwd:root,env:process.env});
  let output='',error='';
  proc.stdout.on('data',b=>output+=b.toString());
  proc.stderr.on('data',b=>error+=b.toString());
  proc.on('error',err=>resolve({code:-1,error:String(err),output}));
  proc.on('close',code=>resolve({code,error,output}));
 });
}
const first=asyncSql('BEGIN; '+call('tx-race-a','event-race-a',15)+'; SELECT pg_sleep(2); COMMIT;');
await new Promise(res=>setTimeout(res,550));
const second=asyncSql(call('tx-race-b','event-race-b',15));
const [oneRace,twoRace]=await Promise.all([first,second]);
assert.equal(oneRace.code,0,'First renewal should commit: '+oneRace.error.slice(0,320));
assert.notEqual(twoRace.code,0,'Second concurrent renewal for same period must reject');
assert.equal(count("SELECT count(*) FROM public.payment_events WHERE user_id='"+user(15)+"'"),1);
assert.equal(one("SELECT current_period_end FROM public.subscriptions WHERE user_id='"+user(15)+"'").slice(0,10),end.slice(0,10));
note('two concurrent PostgreSQL sessions: one paid renewal, one rejected, no duplicate month');
console.log('V278 RESULT: 8 disposable PostgreSQL renewal integration scenarios PASS; no Supabase or Flutterwave calls');
