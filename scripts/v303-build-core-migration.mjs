// V303 offline-only migration generator. Never connects to the database or applies DDL.
// Input MUST be the complete pg_get_functiondef() text from the same live database.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export const OLD_LOOKUP=`  select count(*)::int into v_cron_failures
  from cron.job_run_details
  where start_time >= v_now - interval '2 hours'
    and status not in ('succeeded','running');`;
export const NEW_LOOKUP=`  with recent as materialized (
    select runid,start_time,status
    from cron.job_run_details
    order by runid desc
    limit 1025
  ),
  boundary as (
    select start_time from recent order by runid asc limit 1
  )
  select (select count(*) filter (
    where start_time >= v_now - interval '2 hours'
      and status not in ('succeeded','running')
  )::int from recent),
  (select count(*) from recent) = 1025
    and (select start_time from boundary) < v_now - interval '2 hours'
  into v_cron_failures, v_cron_history_complete;
  if not coalesce(v_cron_history_complete,false) then
    raise exception 'V303 cron audit incomplete; refusing machine state refresh';
  end if;`;
const DECLARE='  v_cron_failures integer := 0;';
const CHECKS=[
'from public.source_connectors',
'from cron.job where active = true',
'from public.agent_runs',
'from public.status_incidents',
'from public.trend_snapshots',
'from public.intelligence_events',
'production_smoke_sweep',
'from public.gold_compiled_permission_snapshots',
'insert into public.autonomous_machine_state',
'insert into public.autonomous_ops_events',
"'can_self_promote',false"
];
function one(s,needle){return s.split(needle).length===2}
function replaceOnce(s,needle,newPart){const i=s.indexOf(needle);if(i<0||s.indexOf(needle,i+needle.length)!==-1)throw Error('nonunique_source_anchor');return s.slice(0,i)+newPart+s.slice(i+needle.length)}
const hash=s=>createHash('md5').update(s,'utf8').digest('hex');
export function buildV303FromExactSource(original){
 if(typeof original!=='string'||original.length<10000||original.length>14000)
  throw Error('source_not_full_pg_get_functiondef');
 if(!original.startsWith('CREATE OR REPLACE FUNCTION public.refresh_autonomous_machine_state()\n')||
   !original.trimEnd().endsWith('$function$')||
   !original.includes(" RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'")||
   (original.match(/\$function\$/g)||[]).length!==2||
   !one(original,OLD_LOOKUP)||!one(original,DECLARE)||
   CHECKS.some(token=>!original.includes(token)))
  throw Error('live_core_source_shape_drift');
 let updated=replaceOnce(original,DECLARE,DECLARE+'\n  v_cron_history_complete boolean := false;');
 updated=replaceOnce(updated,OLD_LOOKUP,NEW_LOOKUP);
 if(!updated.includes('if not coalesce(v_cron_history_complete,false) then')||
    (updated.match(/CREATE OR REPLACE FUNCTION/g)||[]).length!==1)
  throw Error('unsafe_rewrite');
 const acl=String.raw`select pg_get_userbyid(p.proowner)='postgres'
       and p.prosecdef=true
       and p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
       and array_to_string(p.proconfig,',')='search_path=public, pg_temp'
       from pg_proc p where p.oid='public.refresh_autonomous_machine_state()'::regprocedure`;
 const pre=(expected,tag)=>`DO $v303_${tag}$
BEGIN
 IF NOT coalesce((${acl}),false) THEN
  RAISE EXCEPTION 'V303 privilege, owner or security-path drift';
 END IF;
 IF md5(pg_get_functiondef('public.refresh_autonomous_machine_state()'::regprocedure)) <> '${expected}' THEN
  RAISE EXCEPTION 'V303 exact live function fingerprint mismatch';
 END IF;
END
$v303_${tag}$;`;
 const head=`-- V303 offline-built from the exact verified production pg_get_functiondef text.
-- Never deploy while connection admission is unreliable; DDL is transactional and drift-guarded.
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='15s';
`;
 const apply=head+pre(hash(original),'before')+'\n'+updated.trimEnd()+';\n'+pre(hash(updated),'after')+'\n';
 const rollback=head+pre(hash(updated),'rollback_before')+'\n'+original.trimEnd()+';\n'+pre(hash(original),'rollback_after')+'\n';
 return Object.freeze({apply,rollback,originalMd5:hash(original),updatedMd5:hash(updated),originalBytes:original.length,newBytes:updated.length});
}
const invoked=process.argv[1]===fileURLToPath(import.meta.url);
if(invoked){
 const [, ,sourcePath,destination]=process.argv;
 if(!sourcePath||!destination)throw Error('usage: node scripts/v303-build-core-migration.mjs <exact_pg_get_functiondef.txt> <output_directory>');
 const v=buildV303FromExactSource(readFileSync(sourcePath,'utf8'));
 mkdirSync(destination,{recursive:true});
 writeFileSync(join(destination,'v303_apply.sql'),v.apply);
 writeFileSync(join(destination,'v303_rollback.sql'),v.rollback);
 process.stdout.write(JSON.stringify({files:['v303_apply.sql','v303_rollback.sql'],originalMd5:v.originalMd5,updatedMd5:v.updatedMd5})+'\n');
}
