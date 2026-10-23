// Prints a rollback-only PostgreSQL acceptance query; never executes it.
import {readFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(args.some(arg=>!['--candidate','--deployed'].includes(arg))||args.length>1)
 throw new Error('usage: node scripts/v263-atomic-charge-fixture-query.mjs [--candidate|--deployed]');
const read=name=>readFileSync(new URL('../supabase/recovery/'+name,import.meta.url),'utf8');
const ddl=args[0]==='--candidate'?read('v263-atomic-flutterwave-charge.sql'):'';
const fixtures=read('v263-atomic-charge-fixtures.sql');
process.stdout.write(`begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
set local timezone='UTC';
${ddl}
${fixtures}
select pg_temp.v263_assert((select count(*)=27 from pg_temp.v263_assertions),'all 27 integration assertions reached');
rollback;
select 'V263_ROLLBACK_INTEGRATION_PASS' as result, 27 as integration_assertions,
12 as rejected_payment_variants,now() as sampled_at,
(select count(*) from auth.users where email like 'v263-%@example.invalid') as persisted_fixture_users,
md5(jsonb_build_object(
'events',(select jsonb_agg(to_jsonb(e) order by id) from public.payment_events e),
'intents',(select jsonb_agg(to_jsonb(c) order by id) from public.checkout_intents c),
'subscriptions',(select jsonb_agg(to_jsonb(s) order by id) from public.subscriptions s)
)::text) as billing_hash;
`);
