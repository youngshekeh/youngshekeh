-- V180 emergency scheduler load governor
-- Safe recovery plan for the five cron lanes observed creating the largest startup herd.
-- Preserves original schedules for exact rollback. Does not grant capital/trading permission.

begin;
select pg_advisory_xact_lock(hashtextextended('TFA:V180:EMERGENCY:SCHEDULER',0));

create schema if not exists private;
create table if not exists private.v180_emergency_scheduler_baseline(
  jobid bigint primary key,
  jobname text,
  command text not null,
  previous_schedule text not null,
  governed_schedule text not null,
  lane text not null,
  reason text not null,
  captured_at timestamptz not null default now(),
  applied_at timestamptz
);
revoke all on private.v180_emergency_scheduler_baseline from public,anon,authenticated;

do $$
declare r record;
begin
  for r in
    with targets(pattern,desired,lane,reason) as (
      values
      ('%tfa_resolve_all_gold_contracts%','0-59/5 * * * *','INTERNAL_STATE','Contract resolution recovery cadence'),
      ('%tfa_refresh_gold_exposure_objects%','1-59/5 * * * *','INTERNAL_STATE','Exposure refresh staggered after contract resolution'),
      ('%tfa_gold_compile_permission_v1%','1-59/2 * * * *','SAFETY','Permission compiler remains frequent but phase-staggered'),
      ('%detect_v123_gold_transitions%','0-59/2 * * * *','SIGNAL','Transition detector remains frequent on even phase'),
      ('%runtime-v191-gold-signal-event-capture%','2-59/5 * * * *','EVENT_CAPTURE','Observational event capture reduced during recovery')
    )
    select j.jobid,j.jobname,j.command,j.schedule previous_schedule,
           t.desired governed_schedule,t.lane,t.reason
    from cron.job j
    join targets t on j.command ilike t.pattern
    where j.active=true
    order by j.jobid
  loop
    insert into private.v180_emergency_scheduler_baseline(
      jobid,jobname,command,previous_schedule,governed_schedule,lane,reason
    ) values(
      r.jobid,r.jobname,r.command,r.previous_schedule,r.governed_schedule,r.lane,r.reason
    )
    on conflict(jobid) do update set
      jobname=excluded.jobname,command=excluded.command,
      governed_schedule=excluded.governed_schedule,lane=excluded.lane,reason=excluded.reason;

    if r.previous_schedule<>r.governed_schedule then
      perform cron.alter_job(r.jobid,schedule := r.governed_schedule);
      update private.v180_emergency_scheduler_baseline
      set applied_at=coalesce(applied_at,now())
      where jobid=r.jobid;
    end if;
  end loop;
end $$;

commit;
