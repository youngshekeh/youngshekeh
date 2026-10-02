
create table if not exists public.gold_signal_lifecycle_events (
  id bigint generated always as identity primary key,
  event_at timestamptz not null default now(),
  event_key text not null check (event_key ~ '^[A-Z0-9:_-]{3,96}$'),
  event_state text not null check (char_length(event_state) between 1 and 120),
  previous_state text,
  trigger_id text,
  condition text,
  lifecycle_stage text,
  signal_day text,
  signal_time text,
  direction_candidate text,
  anchor_state text,
  anchor_price numeric,
  review_gate_ready boolean not null default false,
  live_required boolean not null default false,
  satisfied boolean not null default false,
  next_window_key text,
  next_window_start_at timestamptz,
  source_version text not null,
  payload jsonb not null default '{}'::jsonb,
  state_fingerprint text not null check (state_fingerprint ~ '^[a-f0-9]{64}$'),
  previous_event_sha256 text,
  event_sha256 text not null unique check (event_sha256 ~ '^[a-f0-9]{64}$'),
  action_permitted text not null default 'WAIT' check (action_permitted='WAIT'),
  capital_permission text not null default '0R' check (capital_permission='0R'),
  automatic_execution boolean not null default false check (automatic_execution=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false),
  created_at timestamptz not null default now()
);

alter table public.gold_signal_lifecycle_events enable row level security;
revoke all on table public.gold_signal_lifecycle_events from public,anon,authenticated;
grant select,insert on table public.gold_signal_lifecycle_events to service_role;
grant usage,select on sequence public.gold_signal_lifecycle_events_id_seq to service_role;

create index if not exists gold_signal_lifecycle_events_key_time_idx
  on public.gold_signal_lifecycle_events(event_key,event_at desc,id desc);
create index if not exists gold_signal_lifecycle_events_time_idx
  on public.gold_signal_lifecycle_events(event_at desc,id desc);

create or replace function public.prevent_v191_gold_signal_event_mutation()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'V191 Gold signal lifecycle ledger is append-only';
end;
$function$;

drop trigger if exists prevent_v191_gold_signal_event_mutation on public.gold_signal_lifecycle_events;
create trigger prevent_v191_gold_signal_event_mutation
before update or delete on public.gold_signal_lifecycle_events
for each row execute function public.prevent_v191_gold_signal_event_mutation();

revoke all on function public.prevent_v191_gold_signal_event_mutation() from public,anon,authenticated;

create or replace function public.capture_v191_gold_signal_event(p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_key text;
  v_state text;
  v_condition text;
  v_now timestamptz := now();
  v_latest public.gold_signal_lifecycle_events%rowtype;
  v_previous_hash text;
  v_fingerprint text;
  v_event_hash text;
  v_id bigint;
  v_payload jsonb;
  v_next_window_start timestamptz;
begin
  if jsonb_typeof(p_event) is distinct from 'object' then
    return jsonb_build_object('ok',false,'error','invalid_event','capital_permission','0R');
  end if;

  v_key := upper(trim(coalesce(p_event->>'event_key','')));
  v_state := trim(coalesce(p_event->>'event_state',''));
  v_condition := nullif(trim(coalesce(p_event->>'condition','')),'');

  if v_key !~ '^[A-Z0-9:_-]{3,96}$'
     or char_length(v_state) not between 1 and 120 then
    return jsonb_build_object('ok',false,'error','invalid_event_identity','capital_permission','0R');
  end if;

  if coalesce(p_event->>'action_permitted','WAIT') <> 'WAIT'
     or coalesce(p_event->>'capital_permission','0R') <> '0R'
     or coalesce((p_event->>'automatic_execution')::boolean,false) <> false
     or coalesce((p_event->>'live_order_submission_enabled')::boolean,false) <> false then
    return jsonb_build_object('ok',false,'error','unsafe_governance_rejected','capital_permission','0R');
  end if;

  begin
    v_next_window_start := nullif(p_event->>'next_window_start_at','')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok',false,'error','invalid_next_window_timestamp','capital_permission','0R');
  end;

  v_payload := jsonb_build_object(
    'event_key',v_key,
    'event_state',v_state,
    'trigger_id',nullif(p_event->>'trigger_id',''),
    'condition',v_condition,
    'lifecycle_stage',nullif(p_event->>'lifecycle_stage',''),
    'signal_day',nullif(p_event->>'signal_day',''),
    'signal_time',nullif(p_event->>'signal_time',''),
    'direction_candidate',nullif(p_event->>'direction_candidate',''),
    'anchor_state',nullif(p_event->>'anchor_state',''),
    'review_gate_ready',coalesce((p_event->>'review_gate_ready')::boolean,false),
    'live_required',coalesce((p_event->>'live_required')::boolean,false),
    'satisfied',coalesce((p_event->>'satisfied')::boolean,false),
    'next_window_key',nullif(p_event->>'next_window_key',''),
    'next_window_start_at',v_next_window_start,
    'source_version',coalesce(nullif(p_event->>'source_version',''),'v189-gold-trigger-watch-v1')
  );

  v_fingerprint := encode(
    extensions.digest(convert_to(v_payload::text,'UTF8'),'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended('v191_gold_signal_event_ledger',191));

  select * into v_latest
    from public.gold_signal_lifecycle_events
   where event_key=v_key
   order by id desc
   limit 1;

  if found and v_latest.state_fingerprint=v_fingerprint then
    return jsonb_build_object(
      'ok',true,'version','v191-gold-signal-event-ledger-v1',
      'state','UNCHANGED','inserted',false,'event_id',v_latest.id,
      'event_key',v_key,'event_state',v_state,'capital_permission','0R'
    );
  end if;

  select event_sha256 into v_previous_hash
    from public.gold_signal_lifecycle_events
   order by id desc
   limit 1;

  v_event_hash := encode(
    extensions.digest(
      convert_to(
        coalesce(v_previous_hash,'GENESIS') || '|' ||
        v_key || '|' || v_state || '|' || v_fingerprint || '|' || v_now::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.gold_signal_lifecycle_events(
    event_at,event_key,event_state,previous_state,trigger_id,condition,
    lifecycle_stage,signal_day,signal_time,direction_candidate,
    anchor_state,anchor_price,review_gate_ready,live_required,satisfied,
    next_window_key,next_window_start_at,source_version,payload,
    state_fingerprint,previous_event_sha256,event_sha256,
    action_permitted,capital_permission,automatic_execution,live_order_submission_enabled
  ) values (
    v_now,v_key,v_state,case when v_latest.id is null then null else v_latest.event_state end,
    nullif(p_event->>'trigger_id',''),v_condition,
    nullif(p_event->>'lifecycle_stage',''),nullif(p_event->>'signal_day',''),
    nullif(p_event->>'signal_time',''),nullif(p_event->>'direction_candidate',''),
    nullif(p_event->>'anchor_state',''),
    case when p_event ? 'anchor_price' and jsonb_typeof(p_event->'anchor_price')='number'
      then (p_event->>'anchor_price')::numeric else null end,
    coalesce((p_event->>'review_gate_ready')::boolean,false),
    coalesce((p_event->>'live_required')::boolean,false),
    coalesce((p_event->>'satisfied')::boolean,false),
    nullif(p_event->>'next_window_key',''),v_next_window_start,
    coalesce(nullif(p_event->>'source_version',''),'v189-gold-trigger-watch-v1'),
    p_event,v_fingerprint,v_previous_hash,v_event_hash,
    'WAIT','0R',false,false
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,'version','v191-gold-signal-event-ledger-v1',
    'state','EVENT_RECORDED','inserted',true,'event_id',v_id,
    'event_key',v_key,'event_state',v_state,
    'previous_state',case when v_latest.id is null then null else v_latest.event_state end,
    'event_sha256',v_event_hash,
    'capital_permission','0R'
  );
end;
$function$;

revoke all on function public.capture_v191_gold_signal_event(jsonb) from public,anon,authenticated;
grant execute on function public.capture_v191_gold_signal_event(jsonb) to service_role;

create or replace function public.get_v191_gold_signal_event_ledger(p_limit integer default 40)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,40),100));
  v_total bigint;
  v_failures bigint;
  v_latest timestamptz;
begin
  select count(*),max(event_at) into v_total,v_latest
    from public.gold_signal_lifecycle_events;

  with ordered as (
    select id,previous_event_sha256,
           lag(event_sha256) over(order by id) as expected_previous
      from public.gold_signal_lifecycle_events
  )
  select count(*) into v_failures
    from ordered
   where (expected_previous is null and previous_event_sha256 is not null)
      or (expected_previous is not null and previous_event_sha256 is distinct from expected_previous);

  return jsonb_build_object(
    'ok',true,
    'version','v191-gold-signal-event-ledger-v1',
    'state',case when v_failures=0 then 'HASH_CHAIN_VERIFIED' else 'HASH_CHAIN_BROKEN' end,
    'generated_at',now(),
    'counts',jsonb_build_object('events',v_total,'chain_failures',v_failures),
    'latest_event_at',v_latest,
    'events',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'event_at',e.event_at,'event_key',e.event_key,
        'event_state',e.event_state,'previous_state',e.previous_state,
        'trigger_id',e.trigger_id,'condition',e.condition,
        'lifecycle_stage',e.lifecycle_stage,'signal_day',e.signal_day,
        'signal_time',e.signal_time,'direction_candidate',e.direction_candidate,
        'anchor_state',e.anchor_state,'anchor_price',e.anchor_price,
        'review_gate_ready',e.review_gate_ready,'live_required',e.live_required,
        'satisfied',e.satisfied,'next_window_key',e.next_window_key,
        'next_window_start_at',e.next_window_start_at,'source_version',e.source_version,
        'event_sha256',e.event_sha256,'action_permitted','WAIT','capital_permission','0R'
      ) order by e.id desc)
      from (
        select * from public.gold_signal_lifecycle_events
        order by id desc limit v_limit
      ) e
    ),'[]'::jsonb),
    'governance',jsonb_build_object(
      'append_only',true,'hash_chained',true,
      'action_permitted','WAIT','capital_permission','0R',
      'automatic_execution',false,'live_order_submission_enabled',false
    )
  );
end;
$function$;

revoke all on function public.get_v191_gold_signal_event_ledger(integer) from public,anon,authenticated;
grant execute on function public.get_v191_gold_signal_event_ledger(integer) to service_role;
