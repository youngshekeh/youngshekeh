#!/usr/bin/env node
// Real PG17 tests, against synthetic replica ONLY. Live credentials forbidden.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
if(process.env.PGHOST!=='127.0.0.1'||process.env.PGDATABASE!=='v284_isolated_test'
 ||process.env.PGUSER!=='postgres'){
 console.error('V284 SAFETY REFUSAL: PG17 synthetic localhost service required');
 process.exit(2);
}
const args=['-X','-A','-t','-q','-v','ON_ERROR_STOP=1'];
function psql(sql,{reject=false}={}){
 try{
  const s=execFileSync('psql',[...args,'-c',sql],{cwd:root,encoding:'utf8',env:process.env,
   timeout:25000,stdio:['ignore','pipe','pipe']}).trim();
  if(reject)throw Error('Unexpectedly accepted rejected SQL');
  return s;
 }catch(e){
  if(!reject||e.message==='Unexpectedly accepted rejected SQL')
   throw Error(String(e.stderr||e.message).slice(0,820));
  return 'REJECTED';
 }
}
function apply(file){
 execFileSync('psql',[...args,'-f',file],{cwd:root,env:process.env,timeout:45000,stdio:'inherit'});
}
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const sc=q=>psql(q).split('\n').at(-1).trim();
const n=q=>Number(sc(q));
const note=s=>console.log('V284 PG17 PASS | '+s);
const now=Date.now(),end1=new Date(now+30*86400000).toISOString(),
 end2=new Date(now+60*86400000).toISOString();
const configs=[['pro',79,1],['executive',499,2],['business',1500,3],['enterprise',5000,4]];
function checkout(ref,u,plan,amount){
 psql("INSERT INTO public.checkout_intents(user_id,plan_id,provider,provider_reference,amount,currency,status) VALUES ('"+
 uid(u)+"','"+plan+"','flutterwave','"+ref+"',"+amount+",'USD','created')");
}
function initial(tx,event,ref,u,plan,amount,term=end1){
 return "SELECT public.fulfill_verified_flutterwave_checkout_v276('"+tx+"','"+event+"','"+
 ref+"','"+uid(u)+"','"+plan+"',"+amount+
 ",'USD','successful',now(),'"+term+"','customer-"+u+"','subscription-"+u+"')";
}
function renewal(tx,event,u,plan,amount,from=end1,to=end2){
 return "SELECT public.fulfill_verified_flutterwave_renewal_v278('"+tx+"','"+event+"','"+
 uid(u)+"','"+plan+"','customer-"+u+"','subscription-"+u+"',"+amount+
 ",'USD','successful',now(),'"+from+"','"+to+"')";
}
apply('tests/fixtures/v284-postgres17-prod-schema.sql');
apply('docs/operations/candidates/v276-atomic-fulfillment-candidate.sql');
apply('docs/operations/candidates/v278-atomic-renewal-candidate.sql');
assert.match(sc("select version()"),/PostgreSQL 17\./);
note('PG17 parses V276 and V278 together against live-metadata-shaped fixture');
for(const fun of ['fulfill_verified_flutterwave_checkout_v276','fulfill_verified_flutterwave_renewal_v278']){
 for(const role of ['anon','authenticated'])
  assert.equal(sc("select has_function_privilege('"+role+"',p.oid,'EXECUTE') from pg_proc p where p.proname='"+fun+"'"),'f');
 assert.equal(sc("select has_function_privilege('service_role',p.oid,'EXECUTE') from pg_proc p where p.proname='"+fun+"'"),'t');
}
note('both candidate RPC EXECUTE roles remain service_role-only');
for(const [plan,price,u] of configs){
 checkout('v284-ref-'+u,u,plan,price);
 assert.match(psql(initial('v284-init-'+u,'v284-event-'+u,'v284-ref-'+u,u,plan,price)),/ATOMICALLY_COMMITTED/);
 assert.equal(n("select count(*) from public.checkout_intents where user_id='"+uid(u)+"' and status='paid'"),1);
 assert.equal(n("select count(*) from public.subscriptions where user_id='"+uid(u)+"' and current_period_end>now()"),1);
}
note('all FOUR actual live USD monthly plan amounts safely fulfill on synthetic auth users');
assert.match(psql(initial('v284-init-1','v284-alternate-event-1','v284-ref-1',1,'pro',79)),/ALREADY_COMMITTED_NOOP/);
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(1)+"'"),1);
note('initial transaction replay with alternate event key is NOOP');
assert.match(psql(renewal('v284-renew-1','v284-renew-event-1',1,'pro',79)),/ATOMIC_RENEWAL_COMMITTED/);
assert.match(psql(renewal('v284-renew-1','v284-renew-event-alt',1,'pro',79)),/ALREADY_COMMITTED_NOOP/);
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(1)+"'"),2);
note('real-price initial and renewal in one DB preserve exactly two distinct events');
checkout('v284-mismatch',7,'pro',79);
psql(initial('v284-badprice','v284-badprice-event','v284-mismatch',7,'pro',29),{reject:true});
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(7)+"'"),0);
psql(renewal('v284-wrong-price','v284-wrong-price-event',1,'pro',29,end2,new Date(now+90*86400000).toISOString()),{reject:true});
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(1)+"'"),2);
note('obsolete synthetic $29 price rejected against verified $79 production plan');
psql("update public.subscriptions set status='canceled' where user_id='"+uid(4)+"'");
psql(renewal('v284-canceled-renew','v284-canceled-event',4,'enterprise',5000),{reject:true});
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(4)+"'"),1);
note('canceled account cannot be silently reactivated by billing event');
checkout('v284-rollback',8,'pro',79);
psql("CREATE FUNCTION public.v284_force_rollback() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.provider_reference='v284-rollback' AND NEW.status='paid' THEN RAISE EXCEPTION 'V284_INJECTED_FAILURE'; END IF; RETURN NEW; END; $$");
psql("CREATE TRIGGER v284_guard BEFORE UPDATE ON public.checkout_intents FOR EACH ROW EXECUTE FUNCTION public.v284_force_rollback()");
psql(initial('v284-triggerfail','v284-trigger-event','v284-rollback',8,'pro',79),{reject:true});
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(8)+"'"),0);
assert.equal(n("select count(*) from public.subscriptions where user_id='"+uid(8)+"'"),0);
note('injected failure rolls back payment event, checkout and paid entitlement');
function sqlSession(sql){
 return new Promise(resolve=>{
  const p=spawn('psql',[...args,'-c',sql],{cwd:root,env:process.env});
  let err='';p.stderr.on('data',b=>err+=b.toString());
  p.on('close',code=>resolve({code,error:err.slice(0,350)}));
  p.on('error',e=>resolve({code:-1,error:String(e)}));
 });
}
const first=sqlSession('BEGIN; '+renewal('v284-race-1','v284-race-event-1',2,'executive',499)+'; SELECT pg_sleep(2); COMMIT;');
await new Promise(r=>setTimeout(r,550));
const second=sqlSession(renewal('v284-race-2','v284-race-event-2',2,'executive',499));
const [a,b]=await Promise.all([first,second]);
assert.equal(a.code,0,'first concurrent provider cycle: '+a.error);
assert.notEqual(b.code,0,'second distinct payment must not extend same cycle');
assert.equal(n("select count(*) from public.payment_events where user_id='"+uid(2)+"'"),2);
note('two independent PG17 concurrent sessions admit one renewal, deny duplicate period');
console.log('V284 RESULT: 8 real PostgreSQL-17 integration scenarios PASS, provider payment HMAC still NOT tested, no live Supabase writes');
