-- V304 exact fingerprint-gated bounded cron.
-- Executes one source-locked CREATE OR REPLACE FUNCTION with existing owner, ACL, search_path and every unrelated engine section intact.
-- Requires stable SQL admission; fails without altering machine state on missing 2h cron audit coverage.
SET LOCAL lock_timeout='1500ms';
SET LOCAL statement_timeout='20s';
DO $v304$
DECLARE
 v_source text;
 v_patched text;
 v_old text := $v304_old$  select count(*)::int into v_cron_failures
  from cron.job_run_details
  where start_time >= v_now - interval '2 hours'
    and status not in ('succeeded','running');$v304_old$;
 v_new text := $v304_new$  with recent as materialized (
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
    raise exception 'V304 cron audit incomplete; refusing machine state refresh';
  end if;$v304_new$;
 v_decl_old text := $v304_decl_old$  v_cron_failures integer := 0;$v304_decl_old$;
 v_decl_new text := $v304_decl_new$  v_cron_failures integer := 0;
  v_cron_history_complete boolean := false;$v304_decl_new$;
 v_target text := 'public.refresh_autonomous_machine_state()';
 v_expected text := 'ad18646c899eaffd2e7f6dfae567ce71';
BEGIN
 IF NOT coalesce((select pg_get_userbyid(p.proowner)='postgres'
   and p.prosecdef=true
   and p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
   and array_to_string(p.proconfig,',')='search_path=public, pg_temp'
 from pg_proc p where p.oid='public.refresh_autonomous_machine_state()'::regprocedure),false) THEN
   RAISE EXCEPTION 'V304 owner, definer, grants or search_path drift';
 END IF;
 v_source := pg_get_functiondef(v_target::regprocedure);
 IF md5(v_source) <> v_expected THEN
   RAISE EXCEPTION 'V304 current source fingerprint drift'; END IF;
 IF position(v_old in v_source)=0 OR
    position(v_old in substring(v_source from position(v_old in v_source)+length(v_old)))>0 OR
    position(v_decl_old in v_source)=0 OR
    position(v_decl_old in substring(v_source from position(v_decl_old in v_source)+length(v_decl_old)))>0 OR
    position(v_new in v_source)>0 THEN
   RAISE EXCEPTION 'V304 query or declaration source is not unique'; END IF;
 IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid=44 AND jobname='tfa-v70-autonomous-core' AND schedule='11,26,41,56 * * * *' AND active=true AND command='select public.refresh_autonomous_machine_state();') THEN RAISE EXCEPTION 'V304 protected scheduler drift'; END IF;
 v_patched := replace(replace(v_source,v_decl_old,v_decl_new),v_old,v_new);
 
 EXECUTE v_patched;
 IF pg_get_functiondef(v_target::regprocedure) IS DISTINCT FROM v_patched
 
 OR NOT coalesce((select pg_get_userbyid(p.proowner)='postgres'
   and p.prosecdef=true
   and p.proacl::text='{postgres=X/postgres,service_role=X/postgres}'
   and array_to_string(p.proconfig,',')='search_path=public, pg_temp'
 from pg_proc p where p.oid='public.refresh_autonomous_machine_state()'::regprocedure),false) THEN
   RAISE EXCEPTION 'V304 postflight source or security mismatch'; END IF;
END
$v304$;
