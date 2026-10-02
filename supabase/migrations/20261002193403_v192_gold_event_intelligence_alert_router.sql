
create table if not exists public.gold_signal_alert_policies (
  version text primary key,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  minimum_dashboard_score integer not null check (minimum_dashboard_score between 0 and 100),
  minimum_notification_score integer not null check (minimum_notification_score between 0 and 100),
  cooldown_minutes integer not null check (cooldown_minutes between 0 and 1440),
  transport_enabled boolean not null default false,
  transport_type text not null default 'NONE',
  destination_label text,
  historical_retrofit boolean not null default false,
  action_permitted text not null default 'WAIT' check (action_permitted='WAIT'),
  capital_permission text not null default '0R' check (capital_permission='0R'),
  automatic_execution boolean not null default false check (automatic_execution=false),
  created_at timestamptz not null default now()
);

insert into public.gold_signal_alert_policies(
  version,minimum_dashboard_score,minimum_notification_score,cooldown_minutes,
  transport_enabled,transport_type,destination_label,historical_retrofit
)
values('V192_ALERT_ROUTER_V1',50,80,15,false,'NONE',null,false)
on conflict(version) do nothing;

create table if not exists public.gold_signal_alert_routes (
  id bigint generated always as identity primary key,
  source_event_id bigint not null unique references public.gold_signal_lifecycle_events(id) on delete restrict,
  routed_at timestamptz not null default now(),
  policy_version text not null references public.gold_signal_alert_policies(version) on delete restrict,
  alert_key text not null,
  alert_type text not null,
  severity text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  priority_score integer not null check (priority_score between 0 and 100),
  route_state text not null check (route_state in (
    'SUPPRESSED_LOW_PRIORITY',
    'SUPPRESSED_COOLDOWN',
    'DASHBOARD_ONLY',
    'NOTIFICATION_READY'
  )),
  reason text not null,
  event_key text not null,
  event_state text not null,
  direction_candidate text,
  lifecycle_stage text,
  signal_day text,
  signal_time text,
  review_gate_ready boolean not null default false,
  source_event_sha256 text not null,
  previous_route_sha256 text,
  route_sha256 text not null unique,
  payload jsonb not null default '{}'::jsonb,
  action_permitted text not null default 'WAIT' check (action_permitted='WAIT'),
  capital_permission text not null default '0R' check (capital_permission='0R'),
  automatic_execution boolean not null default false check (automatic_execution=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false),
  created_at timestamptz not null default now()
);

alter table public.gold_signal_alert_policies enable row level security;
alter table public.gold_signal_alert_routes enable row level security;
revoke all on table public.gold_signal_alert_policies from public,anon,authenticated;
revoke all on table public.gold_signal_alert_routes from public,anon,authenticated;
grant select on table public.gold_signal_alert_policies to service_role;
grant select,insert on table public.gold_signal_alert_routes to service_role;
grant usage,select on sequence public.gold_signal_alert_routes_id_seq to service_role;

create index if not exists gold_signal_alert_routes_time_idx
  on public.gold_signal_alert_routes(routed_at desc,id desc);
create index if not exists gold_signal_alert_routes_key_time_idx
  on public.gold_signal_alert_routes(alert_key,routed_at desc,id desc);
create index if not exists gold_signal_alert_routes_state_time_idx
  on public.gold_signal_alert_routes(route_state,routed_at desc,id desc);

create or replace function public.prevent_v192_gold_alert_route_mutation()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'V192 Gold alert routes are append-only';
end;
$function$;

drop trigger if exists prevent_v192_gold_alert_route_mutation on public.gold_signal_alert_routes;
create trigger prevent_v192_gold_alert_route_mutation
before update or delete on public.gold_signal_alert_routes
for each row execute function public.prevent_v192_gold_alert_route_mutation();

revoke all on function public.prevent_v192_gold_alert_route_mutation() from public,anon,authenticated;

create or replace function public.classify_v192_gold_alert(p_event jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  k text := upper(coalesce(p_event->>'event_key',''));
  s text := upper(coalesce(p_event->>'event_state',''));
  c text := upper(coalesce(p_event->>'condition',''));
  d text := upper(coalesce(p_event->>'direction_candidate','NEUTRAL'));
  score integer := 10;
  sev text := 'INFO';
  typ text := 'STATE_CHANGE';
  why text := 'Low-priority material state change.';
begin
  if k='REVIEW_GATE' and s='READY' then
    score:=100; sev:='CRITICAL'; typ:='HUMAN_REVIEW_READY'; why:='All V189 human-review prerequisites became true.';
  elsif k='WATCH_STATE' and s='HUMAN_REVIEW_READY' then
    score:=100; sev:='CRITICAL'; typ:='HUMAN_REVIEW_READY'; why:='Gold Trigger Watch entered human-review-ready state.';
  elsif k='SIGNAL_TIME' and s='ACTIVE_SIGNAL_TIME' then
    score:=90; sev:='HIGH'; typ:='SIGNAL_WINDOW_ACTIVE'; why:='A primary Gold signal-time window became active.';
  elsif k='NEXT_SIGNAL_WINDOW' and s='ACTIVE' then
    score:=90; sev:='HIGH'; typ:='SIGNAL_WINDOW_ACTIVE'; why:='The next primary Gold signal window is active.';
  elsif k='NEXT_SIGNAL_WINDOW' and s='PREP' then
    score:=65; sev:='MEDIUM'; typ:='SIGNAL_WINDOW_PREP'; why:='Gold is inside the pre-signal preparation window.';
  elsif k='TRIGGER:LIVE_XAUUSD_BRIDGE' and s in ('INFO','ACTIVE_REVIEW') then
    score:=88; sev:='HIGH'; typ:='LIVE_XAUUSD_CONNECTED'; why:='Fresh broker XAUUSD became available to the governed stack.';
  elsif k='TRIGGER:LIQUIDITY_TRANSITION' and s='ACTIVE_REVIEW' then
    score:=86; sev:='HIGH'; typ:='LIQUIDITY_TRANSITION_RESOLVED'; why:='Liquidity transition reached active-review state.';
  elsif k='TRIGGER:LIQUIDITY_TRANSITION' and s='ARMED' then
    score:=68; sev:='MEDIUM'; typ:='LIQUIDITY_TRANSITION_ARMED'; why:='Liquidity reclaim/acceptance confirmation is armed.';
  elsif k='TRIGGER:SESSION_LIQUIDITY_PROXIMITY' and s='ACTIVE_REVIEW' then
    score:=84; sev:='HIGH'; typ:='SESSION_LIQUIDITY_TOUCH'; why:='Price reached active-review proximity to session liquidity.';
  elsif k='TRIGGER:SESSION_LIQUIDITY_PROXIMITY' and s='ARMED' then
    score:=63; sev:='MEDIUM'; typ:='SESSION_LIQUIDITY_APPROACH'; why:='Price approached a tracked session-liquidity level.';
  elsif k='TRIGGER:DAILY_LOWER_ZONE' and s='ACTIVE_REVIEW' then
    score:=82; sev:='HIGH'; typ:='DAILY_ZONE_TOUCH'; why:='Price entered the Daily lower tradeable zone.';
  elsif k='TRIGGER:DAILY_LOWER_ZONE' and s='ARMED' then
    score:=62; sev:='MEDIUM'; typ:='DAILY_ZONE_APPROACH'; why:='Price approached the Daily lower tradeable zone.';
  elsif k='TRIGGER:WEEKLY_LOWER_ZONE' and s='ACTIVE_REVIEW' then
    score:=80; sev:='HIGH'; typ:='WEEKLY_ZONE_TOUCH'; why:='Price entered the Weekly lower tradeable zone.';
  elsif k='TRIGGER:WEEKLY_LOWER_ZONE' and s='ARMED' then
    score:=60; sev:='MEDIUM'; typ:='WEEKLY_ZONE_APPROACH'; why:='Price approached the Weekly lower tradeable zone.';
  elsif k='TRIGGER:BREAKOUT_FAILURE_REVIEW' and s in ('ARMED','ACTIVE_REVIEW') then
    score:=72; sev:='MEDIUM'; typ:='BREAKOUT_FAILURE_REVIEW'; why:='A failed-breakout structure requires review.';
  elsif k='SIGNAL_DAY' and s='SIGNAL_DAY_CONFIRMED' then
    score:=55; sev:='MEDIUM'; typ:='SIGNAL_DAY_CONFIRMED'; why:='The Gold day-state engine confirmed a Signal Day.';
  elsif k='LIFECYCLE_STAGE' and s in ('RECLAIM_ACCEPTED','ACCEPTANCE_CONFIRMED') then
    score:=78; sev:='MEDIUM'; typ:='LIFECYCLE_CONFIRMATION'; why:='The Gold lifecycle reached a confirmed reclaim/acceptance stage.';
  elsif k='LIFECYCLE_STAGE' and s='LIQUIDITY_RAID' then
    score:=66; sev:='MEDIUM'; typ:='LIQUIDITY_RAID'; why:='The Gold lifecycle detected a liquidity raid.';
  elsif k='LIFECYCLE_STAGE' and s='EXTENSION_EXHAUSTION_WATCH' then
    score:=70; sev:='MEDIUM'; typ:='EXHAUSTION_WATCH'; why:='The Gold lifecycle entered extension-exhaustion watch.';
  elsif k='WATCH_STATE' and s='WAITING_FOR_LIVE_XAUUSD' then
    score:=35; sev:='LOW'; typ:='LIVE_DATA_BLOCKED'; why:='Live-qualified alerts remain blocked until V186 has fresh broker XAUUSD.';
  elsif k='TRIGGER:LIVE_XAUUSD_BRIDGE' and s='BLOCKED' then
    score:=35; sev:='LOW'; typ:='LIVE_DATA_BLOCKED'; why:='Fresh broker XAUUSD is not connected.';
  end if;

  return jsonb_build_object(
    'ok',true,
    'version','v192-gold-alert-classifier-v1',
    'alert_type',typ,
    'severity',sev,
    'priority_score',score,
    'alert_key',typ || ':' || d,
    'reason',why,
    'score_is_probability',false
  );
end;
$function$;

revoke all on function public.classify_v192_gold_alert(jsonb) from public,anon,authenticated;
grant execute on function public.classify_v192_gold_alert(jsonb) to service_role;

create or replace function public.route_v192_gold_signal_event()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  p public.gold_signal_alert_policies%rowtype;
  cls jsonb;
  key text;
  typ text;
  sev text;
  score integer;
  reason text;
  route_state text;
  recent_same timestamptz;
  prev_hash text;
  route_hash text;
  route_payload jsonb;
begin
  select * into p
    from public.gold_signal_alert_policies
   where active=true
   order by effective_from desc
   limit 1;

  if p.version is null then
    return new;
  end if;

  cls := public.classify_v192_gold_alert(jsonb_build_object(
    'event_key',new.event_key,
    'event_state',new.event_state,
    'condition',new.condition,
    'direction_candidate',new.direction_candidate
  ));

  key := cls->>'alert_key';
  typ := cls->>'alert_type';
  sev := cls->>'severity';
  score := (cls->>'priority_score')::integer;
  reason := cls->>'reason';

  if score < p.minimum_dashboard_score then
    route_state := 'SUPPRESSED_LOW_PRIORITY';
  else
    select max(routed_at) into recent_same
      from public.gold_signal_alert_routes
     where alert_key=key
       and route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY')
       and routed_at >= now() - make_interval(mins=>p.cooldown_minutes);

    if recent_same is not null then
      route_state := 'SUPPRESSED_COOLDOWN';
    elsif score >= p.minimum_notification_score and p.transport_enabled then
      route_state := 'NOTIFICATION_READY';
    else
      route_state := 'DASHBOARD_ONLY';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v192_gold_signal_alert_routes',192));

  select route_sha256 into prev_hash
    from public.gold_signal_alert_routes
   order by id desc
   limit 1;

  route_payload := jsonb_build_object(
    'source_event_id',new.id,
    'event_key',new.event_key,
    'event_state',new.event_state,
    'condition',new.condition,
    'alert_key',key,
    'alert_type',typ,
    'severity',sev,
    'priority_score',score,
    'route_state',route_state,
    'reason',reason,
    'direction_candidate',new.direction_candidate,
    'lifecycle_stage',new.lifecycle_stage,
    'signal_day',new.signal_day,
    'signal_time',new.signal_time,
    'review_gate_ready',new.review_gate_ready,
    'source_event_sha256',new.event_sha256,
    'policy_version',p.version,
    'transport_enabled',p.transport_enabled,
    'transport_type',p.transport_type,
    'destination_label',p.destination_label
  );

  route_hash := encode(
    extensions.digest(
      convert_to(
        coalesce(prev_hash,'GENESIS') || '|' || route_payload::text || '|' || now()::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.gold_signal_alert_routes(
    source_event_id,policy_version,alert_key,alert_type,severity,priority_score,
    route_state,reason,event_key,event_state,direction_candidate,lifecycle_stage,
    signal_day,signal_time,review_gate_ready,source_event_sha256,
    previous_route_sha256,route_sha256,payload,
    action_permitted,capital_permission,automatic_execution,live_order_submission_enabled
  ) values (
    new.id,p.version,key,typ,sev,score,route_state,reason,new.event_key,new.event_state,
    new.direction_candidate,new.lifecycle_stage,new.signal_day,new.signal_time,
    new.review_gate_ready,new.event_sha256,prev_hash,route_hash,route_payload,
    'WAIT','0R',false,false
  )
  on conflict(source_event_id) do nothing;

  return new;
end;
$function$;

revoke all on function public.route_v192_gold_signal_event() from public,anon,authenticated;

drop trigger if exists route_v192_gold_signal_event on public.gold_signal_lifecycle_events;
create trigger route_v192_gold_signal_event
after insert on public.gold_signal_lifecycle_events
for each row execute function public.route_v192_gold_signal_event();

create or replace function public.get_v192_gold_alert_router(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  lim integer := greatest(1,least(coalesce(p_limit,30),100));
  pol public.gold_signal_alert_policies%rowtype;
  failures bigint;
  total bigint;
  visible bigint;
  latest timestamptz;
begin
  select * into pol
    from public.gold_signal_alert_policies
   where active=true
   order by effective_from desc
   limit 1;

  select count(*),count(*) filter(where route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY')),max(routed_at)
    into total,visible,latest
    from public.gold_signal_alert_routes;

  with ordered as (
    select id,previous_route_sha256,
           lag(route_sha256) over(order by id) expected_previous
      from public.gold_signal_alert_routes
  )
  select count(*) into failures
    from ordered
   where (expected_previous is null and previous_route_sha256 is not null)
      or (expected_previous is not null and previous_route_sha256 is distinct from expected_previous);

  return jsonb_build_object(
    'ok',true,
    'version','v192-gold-alert-router-v1',
    'state',case when failures=0 then 'ROUTER_CHAIN_VERIFIED' else 'ROUTER_CHAIN_BROKEN' end,
    'generated_at',now(),
    'counts',jsonb_build_object(
      'routes',total,
      'visible_alerts',visible,
      'chain_failures',failures,
      'notification_ready',(select count(*) from public.gold_signal_alert_routes where route_state='NOTIFICATION_READY')
    ),
    'policy',jsonb_build_object(
      'version',pol.version,
      'minimum_dashboard_score',pol.minimum_dashboard_score,
      'minimum_notification_score',pol.minimum_notification_score,
      'cooldown_minutes',pol.cooldown_minutes,
      'transport_enabled',pol.transport_enabled,
      'transport_type',pol.transport_type,
      'destination_label',pol.destination_label,
      'historical_retrofit',pol.historical_retrofit
    ),
    'latest_route_at',latest,
    'alerts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'source_event_id',r.source_event_id,'routed_at',r.routed_at,
        'alert_key',r.alert_key,'alert_type',r.alert_type,'severity',r.severity,
        'priority_score',r.priority_score,'route_state',r.route_state,'reason',r.reason,
        'event_key',r.event_key,'event_state',r.event_state,
        'direction_candidate',r.direction_candidate,'lifecycle_stage',r.lifecycle_stage,
        'signal_day',r.signal_day,'signal_time',r.signal_time,
        'review_gate_ready',r.review_gate_ready,'source_event_sha256',r.source_event_sha256,
        'route_sha256',r.route_sha256,'action_permitted','WAIT','capital_permission','0R'
      ) order by r.id desc)
      from (
        select *
          from public.gold_signal_alert_routes
         where route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY')
         order by id desc
         limit lim
      ) r
    ),'[]'::jsonb),
    'recent_routes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.id,'source_event_id',r.source_event_id,'routed_at',r.routed_at,
        'alert_type',r.alert_type,'severity',r.severity,'priority_score',r.priority_score,
        'route_state',r.route_state,'event_key',r.event_key,'event_state',r.event_state
      ) order by r.id desc)
      from (
        select * from public.gold_signal_alert_routes order by id desc limit lim
      ) r
    ),'[]'::jsonb),
    'governance',jsonb_build_object(
      'priority_score_not_probability',true,
      'alerts_are_review_prompts_only',true,
      'append_only',true,'hash_chained',true,
      'action_permitted','WAIT','capital_permission','0R',
      'automatic_execution',false,'live_order_submission_enabled',false
    )
  );
end;
$function$;

revoke all on function public.get_v192_gold_alert_router(integer) from public,anon,authenticated;
grant execute on function public.get_v192_gold_alert_router(integer) to service_role;
