-- V261 read-only PostgreSQL metric assertions. No production tables are read or written.
-- Fixed clock; boundary, overlapping, failed, running, NULL status/start/end records.
-- Query expressions copied from the guarded repair; expected values counted by hand.
-- Run with psql -v ON_ERROR_STOP=1 -f this_file.sql.
begin;
set local timezone='UTC';

do $v261_fixture$
declare v_actual jsonb;
begin
  with fixture_base(runid,status,start_time,end_time) as (values
 (1,'succeeded'::text,'2026-10-23 21:00:00+00'::timestamptz,'2026-10-23 21:00:10+00'::timestamptz),
 (2,'running','2026-10-23 21:30:00+00',null),
 (3,'failed','2026-10-23 21:45:00+00','2026-10-23 21:45:10+00'),
 (4,'succeeded','2026-10-23 21:59:00+00','2026-10-23 21:59:20+00'),
 (5,'succeeded','2026-10-23 21:59:00+00','2026-10-23 21:59:30+00'),
 (6,null,'2026-10-23 21:50:00+00',null),
 (7,'failed','2026-10-23 20:59:59+00','2026-10-23 21:01:00+00'),
 (8,'connecting',null,null)), fixture as(select *,runid as jobid from fixture_base), calc(peak,peak_starts,quarter_peak,failures,runs,peak15,failures15,runs15,peak60,failures60,runs60,hot) as (with history as materialized (
    select runid,jobid,start_time,end_time as finished_at,
      coalesce(end_time,'2026-10-23 22:00:00+00'::timestamptz) as end_time,status
    from fixture
    where start_time>=least('2026-10-23 21:00:00+00'::timestamptz,'2026-10-23 22:00:00+00'::timestamptz-interval '60 minutes')
  ), runs as materialized (
    select * from history where start_time>='2026-10-23 21:00:00+00'::timestamptz
  ), events as (
    select start_time as ts,1 as delta from runs
    union all select end_time as ts,-1 as delta from runs
  ), sweep as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from events
  ), starts as materialized (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts,
      count(*) filter(where status not in ('succeeded','running'))::int as failures,
      round(max(extract(epoch from (finished_at-start_time))*1000)
        filter(where finished_at is not null)::numeric,1) as max_runtime_ms
    from runs group by 1
  ), r60 as materialized (
    select start_time,status from history where start_time>='2026-10-23 22:00:00+00'::timestamptz-interval '60 minutes'
  ), r15 as materialized (
    select * from r60 where start_time>='2026-10-23 22:00:00+00'::timestamptz-interval '15 minutes'
  ), m15 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts from r15 group by 1
  ), m60 as (
    select date_trunc('minute',start_time) as bucket,count(*)::int as starts from r60 group by 1
  ), hot as (
    select bucket as minute,starts,failures,max_runtime_ms
    from starts order by starts desc,bucket desc limit 12
  )
  select
    coalesce((select max(concurrent) from sweep),0)::int,
    coalesce((select max(starts) from starts),0)::int,
    coalesce((select max(starts) from starts where extract(minute from bucket)::int in (0,15,30,45)),0)::int,
    (select count(*) from runs where status not in ('succeeded','running'))::int,
    (select count(*) from runs)::int,
    coalesce((select max(starts) from m15),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r15)::int,
    coalesce((select max(starts) from m60),0)::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int,
    (select count(*) from r60)::int,
    coalesce((select jsonb_agg(hot) from hot),'[]'::jsonb)) select to_jsonb(calc) into v_actual from calc;
  if v_actual is distinct from '{"peak":4,"peak_starts":2,"quarter_peak":1,"failures":1,"runs":6,"peak15":2,"failures15":1,"runs15":4,"peak60":2,"failures60":1,"runs60":6,"hot":[{"minute":"2026-10-23T21:59:00+00:00","starts":2,"failures":0,"max_runtime_ms":30000},{"minute":"2026-10-23T21:50:00+00:00","starts":1,"failures":0,"max_runtime_ms":null},{"minute":"2026-10-23T21:45:00+00:00","starts":1,"failures":1,"max_runtime_ms":10000},{"minute":"2026-10-23T21:30:00+00:00","starts":1,"failures":0,"max_runtime_ms":null},{"minute":"2026-10-23T21:00:00+00:00","starts":1,"failures":0,"max_runtime_ms":10000}]}'::jsonb then
    raise exception 'compute_v1461_peak_spreader_status fixture mismatch: %',v_actual;
  end if;
end
$v261_fixture$;

do $v261_fixture$
declare v_actual jsonb;
begin
  with fixture_base(runid,status,start_time,end_time) as (values
 (1,'succeeded'::text,'2026-10-23 21:00:00+00'::timestamptz,'2026-10-23 21:00:10+00'::timestamptz),
 (2,'running','2026-10-23 21:30:00+00',null),
 (3,'failed','2026-10-23 21:45:00+00','2026-10-23 21:45:10+00'),
 (4,'succeeded','2026-10-23 21:59:00+00','2026-10-23 21:59:20+00'),
 (5,'succeeded','2026-10-23 21:59:00+00','2026-10-23 21:59:30+00'),
 (6,null,'2026-10-23 21:50:00+00',null),
 (7,'failed','2026-10-23 20:59:59+00','2026-10-23 21:01:00+00'),
 (8,'connecting',null,null)), fixture as(select *,runid as jobid from fixture_base), calc(running,peak15,peak60,failures15,failures60) as (with r60 as materialized (
    select runid,jobid,start_time,coalesce(end_time,'2026-10-23 22:00:00+00'::timestamptz) as end_time,status
    from fixture
    where start_time>='2026-10-23 22:00:00+00'::timestamptz-interval '60 minutes'
  ), r15 as materialized (
    select * from r60 where start_time>='2026-10-23 22:00:00+00'::timestamptz-interval '15 minutes'
  ), e15 as (
    select start_time as ts,1 as delta from r15
    union all select end_time as ts,-1 as delta from r15
  ), s15 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e15
  ), e60 as (
    select start_time as ts,1 as delta from r60
    union all select end_time as ts,-1 as delta from r60
  ), s60 as (
    select ts,sum(delta) over(order by ts,delta desc rows unbounded preceding) as concurrent
    from e60
  )
  select
    (select count(*) from r60 where status='running' and start_time>='2026-10-23 22:00:00+00'::timestamptz-interval '30 minutes')::int,
    coalesce((select max(concurrent) from s15),0)::int,
    coalesce((select max(concurrent) from s60),0)::int,
    (select count(*) from r15 where status not in ('succeeded','running'))::int,
    (select count(*) from r60 where status not in ('succeeded','running'))::int) select to_jsonb(calc) into v_actual from calc;
  if v_actual is distinct from '{"running":1,"peak15":3,"peak60":4,"failures15":1,"failures60":1}'::jsonb then
    raise exception 'compute_v147_connection_pressure_shadow fixture mismatch: %',v_actual;
  end if;
end
$v261_fixture$;

rollback;
