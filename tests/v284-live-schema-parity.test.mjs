import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const snap=JSON.parse(read('docs/operations/evidence/v284-live-billing-schema-snapshot.json'));
const fixture=read('tests/fixtures/v284-postgres17-prod-schema.sql');
const first=read('docs/operations/candidates/v276-atomic-fulfillment-candidate.sql');
const renewal=read('docs/operations/candidates/v278-atomic-renewal-candidate.sql');
test('V284 source snapshot reflects PostgreSQL 17, no private user data',()=>{
 assert.equal(snap.postgres_version,'17.6');
 assert.equal(snap.no_customer_rows_copied,true);
 assert.equal(snap.installed_v276_v278_functions,0);
 assert.equal(snap.valid_future_paid_term_rows,0);
 assert.deepEqual(snap.actual_active_provider_plan_monthly_usd,{pro:79,executive:499,business:1500,enterprise:5000});
 for(const [plan,price] of Object.entries(snap.actual_active_provider_plan_monthly_usd)){
  assert.ok(fixture.includes("('"+plan+"','"),'plan exists '+plan);
  assert.ok(fixture.includes("',"+price+",true)"),'price exists '+price);
 }
});
test('database columns referenced by BOTH uninstalled RPCs are in actual live schema',()=>{
 const columns={
  plans:['id','is_active','price_monthly_usd'],
  billing_plan_mappings:['plan_id','provider','provider_plan_id','is_active','recurring','currency'],
  checkout_intents:['id','user_id','plan_id','provider','provider_reference','status','amount','currency','updated_at'],
  payment_events:['provider','provider_event_key','event_type','user_id','plan_id','amount','currency','status','raw_payload'],
  subscriptions:['id','user_id','plan_id','status','provider','provider_customer_id','provider_subscription_id','current_period_end','updated_at']
 };
 for(const [table,list] of Object.entries(columns))
  for(const column of list)assert.equal(typeof snap.tables[table][column],'string',table+'.'+column);
 assert.match(first,/public\.checkout_intents/);
 assert.match(first,/public\.payment_events/);
 assert.match(first,/public\.subscriptions/);
 assert.match(renewal,/public\.billing_plan_mappings/);
});
test('transaction and replay constraints are live-present and reproduced in isolated PG17 schema',()=>{
 for(const x of ['checkout_intents_provider_reference_key',
  'checkout_intents_one_open_per_user_plan_provider',
  'payment_events_flutterwave_transaction_unique',
  'subscriptions_provider_subscription_unique','subscriptions_provider_customer_unique',
  'subscriptions_user_id_key'])
  assert.ok(snap.unique_index_names.includes(x),x);
 for(const x of ['checkout_intents_provider_reference_key',
  'checkout_intents_one_open_per_user_plan_provider',
  'payment_events_flutterwave_transaction_unique',
  'subscriptions_provider_subscription_unique','subscriptions_provider_customer_unique'])
  assert.ok(fixture.includes(x),x);
 assert.match(fixture,/REFERENCES auth\.users\(id\)/);
 assert.match(fixture,/status IN \('inactive','trialing','active','past_due','canceled'\)/);
});
test('payment contract remains uninstalled, no live provider authorization',()=>{
 for(const sql of [first,renewal]){
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/TO service_role/);
 }
 assert.match(read('src/checkout.ts'),/CHECKOUT_SERVER_GUARD_DEPLOYED=false/);
 assert.match(read('supabase/functions/create-checkout/index.ts'),/V272_CHARGES_ENABLED=false/);
 assert.ok(snap.limits.some(x=>x.includes('not a production database clone')));
});
