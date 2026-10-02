
create table if not exists public.gold_signal_alert_actions (
  id bigint generated always as identity primary key,
  alert_route_id bigint not null references public.gold_signal_alert_routes(id) on delete restrict,
  owner_user_id uuid not null,
  action_at timestamptz not null default now(),
  action text not null check (action in ('ACKNOWLEDGED','SNOOZED','CLOSED')),
  snooze_until timestamptz,
  note text,
  state_after text not null check (state_after in ('ACKNOWLEDGED','SNOOZED','CLOSED')),
  action_fingerprint text not null check (action_fingerprint ~ '^[a-f0-9]{64}$'),
  previous_action_sha256 text,
  action_sha256 text not null unique check (action_sha256 ~ '^[a-f0-9]{64}$'),
  aal2_verified boolean not null default true check (aal2_verified=true),
  action_permitted text not null default 'WAIT' check (action_permitted='WAIT'),
  capital_permission text not null default '0R' check (capital_permission='0R'),
  automatic_execution boolean not null default false check (automatic_execution=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false),
  created_at timestamptz not null default now()
);

alter table public.gold_signal_alert_actions enable row level security;
revoke all on table public.gold_signal_alert_actions from public,anon,authenticated;
grant select,insert on table public.gold_signal_alert_actions to service_role;
grant usage,select on sequence public.gold_signal_alert_actions_id_seq to service_role;

create index if not exists gold_signal_alert_actions_alert_time_idx
  on public.gold_signal_alert_actions(alert_route_id,action_at desc,id desc);
create index if not exists gold_signal_alert_actions_owner_time_idx
  on public.gold_signal_alert_actions(owner_user_id,action_at desc,id desc);

create or replace function public.prevent_v193_gold_alert_action_mutation()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  raise exception 'V193 Gold alert actions are append-only';
end;
$function$;

drop trigger if exists prevent_v193_gold_alert_action_mutation on public.gold_signal_alert_actions;
create trigger prevent_v193_gold_alert_action_mutation
before update or delete on public.gold_signal_alert_actions
for each row execute function public.prevent_v193_gold_alert_action_mutation();

revoke all on function public.prevent_v193_gold_alert_action_mutation() from public,anon,authenticated;

create or replace function public.record_v193_gold_alert_action(
  p_alert_route_id bigint,
  p_owner_user_id uuid,
  p_action text,
  p_snooze_until timestamptz default null,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  v_action text := upper(trim(coalesce(p_action,'')));
  v_route public.gold_signal_alert_routes%rowtype;
  v_latest public.gold_signal_alert_actions%rowtype;
  v_note text := nullif(left(trim(coalesce(p_note,'')),500),'');
  v_fingerprint text;
  v_prev_hash text;
  v_hash text;
  v_id bigint;
  v_now timestamptz := now();
begin
  if p_owner_user_id is null
     or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true) then
    return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R');
  end if;

  if v_action not in ('ACKNOWLEDGED','SNOOZED','CLOSED') then
    return jsonb_build_object('ok',false,'error','invalid_action','capital_permission','0R');
  end if;

  if v_action='SNOOZED' and (p_snooze_until is null or p_snooze_until<=v_now or p_snooze_until>v_now+interval '24 hours') then
    return jsonb_build_object('ok',false,'error','invalid_snooze_until','capital_permission','0R');
  end if;

  if v_action<>'SNOOZED' and p_snooze_until is not null then
    return jsonb_build_object('ok',false,'error','snooze_not_allowed_for_action','capital_permission','0R');
  end if;

  select * into v_route
    from public.gold_signal_alert_routes
   where id=p_alert_route_id
     and route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY');
  if not found then
    return jsonb_build_object('ok',false,'error','alert_not_reviewable','capital_permission','0R');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('v193_alert|'||p_alert_route_id::text,193));

  select * into v_latest
    from public.gold_signal_alert_actions
   where alert_route_id=p_alert_route_id
   order by id desc
   limit 1;

  v_fingerprint:=encode(
    extensions.digest(convert_to(
      jsonb_build_object(
        'alert_route_id',p_alert_route_id,
        'owner_user_id',p_owner_user_id,
        'action',v_action,
        'snooze_until',case when v_action='SNOOZED' then p_snooze_until else null end,
        'note',v_note
      )::text,'UTF8'),'sha256'),'hex'
  );

  if v_latest.id is not null and v_latest.action_fingerprint=v_fingerprint then
    return jsonb_build_object(
      'ok',true,'version','v193-owner-alert-inbox-v1','duplicate',true,
      'action_id',v_latest.id,'alert_route_id',p_alert_route_id,
      'state_after',v_latest.state_after,'capital_permission','0R'
    );
  end if;

  select action_sha256 into v_prev_hash
    from public.gold_signal_alert_actions
   order by id desc
   limit 1;

  v_hash:=encode(
    extensions.digest(convert_to(
      coalesce(v_prev_hash,'GENESIS')||'|'||v_fingerprint||'|'||v_now::text,
      'UTF8'),'sha256'),'hex'
  );

  insert into public.gold_signal_alert_actions(
    alert_route_id,owner_user_id,action_at,action,snooze_until,note,state_after,
    action_fingerprint,previous_action_sha256,action_sha256,aal2_verified,
    action_permitted,capital_permission,automatic_execution,live_order_submission_enabled
  ) values (
    p_alert_route_id,p_owner_user_id,v_now,v_action,
    case when v_action='SNOOZED' then p_snooze_until else null end,
    v_note,v_action,v_fingerprint,v_prev_hash,v_hash,true,'WAIT','0R',false,false
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,'version','v193-owner-alert-inbox-v1','duplicate',false,
    'action_id',v_id,'alert_route_id',p_alert_route_id,'state_after',v_action,
    'action_sha256',v_hash,'capital_permission','0R'
  );
end;
$function$;

revoke all on function public.record_v193_gold_alert_action(bigint,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.record_v193_gold_alert_action(bigint,uuid,text,timestamptz,text) to service_role;

create or replace function public.get_v193_gold_alert_inbox(
  p_owner_user_id uuid,
  p_limit integer default 30
) returns jsonb
language plpgsql
stable
security invoker
set search_path to 'pg_catalog','pg_temp'
as $function$
declare
  lim integer:=greatest(1,least(coalesce(p_limit,30),100));
  v_total bigint;
  v_open bigint;
  v_snoozed bigint;
  v_closed bigint;
  v_failures bigint;
begin
  if p_owner_user_id is null
     or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true) then
    return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R');
  end if;

  with ordered as (
    select id,previous_action_sha256,
           lag(action_sha256) over(order by id) expected_previous
      from public.gold_signal_alert_actions
  )
  select count(*) into v_failures
    from ordered
   where (expected_previous is null and previous_action_sha256 is not null)
      or (expected_previous is not null and previous_action_sha256 is distinct from expected_previous);

  with items as (
    select r.id,
           a.action,a.snooze_until
      from public.gold_signal_alert_routes r
      left join lateral (
        select x.action,x.snooze_until
          from public.gold_signal_alert_actions x
         where x.alert_route_id=r.id
         order by x.id desc
         limit 1
      ) a on true
     where r.route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY')
  )
  select count(*),
         count(*) filter(where action is null or action='ACKNOWLEDGED' or (action='SNOOZED' and snooze_until<=now())),
         count(*) filter(where action='SNOOZED' and snooze_until>now()),
         count(*) filter(where action='CLOSED')
    into v_total,v_open,v_snoozed,v_closed
    from items;

  return jsonb_build_object(
    'ok',true,'version','v193-owner-alert-inbox-v1',
    'state',case when v_failures=0 then 'ACTION_CHAIN_VERIFIED' else 'ACTION_CHAIN_BROKEN' end,
    'generated_at',now(),
    'counts',jsonb_build_object('total_reviewable',v_total,'open',v_open,'snoozed',v_snoozed,'closed',v_closed,'chain_failures',v_failures),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'alert_route_id',x.id,'routed_at',x.routed_at,'alert_type',x.alert_type,
        'severity',x.severity,'priority_score',x.priority_score,'reason',x.reason,
        'event_key',x.event_key,'event_state',x.event_state,
        'direction_candidate',x.direction_candidate,'lifecycle_stage',x.lifecycle_stage,
        'signal_day',x.signal_day,'signal_time',x.signal_time,
        'review_gate_ready',x.review_gate_ready,'route_sha256',x.route_sha256,
        'review_state',case
          when x.latest_action='CLOSED' then 'CLOSED'
          when x.latest_action='SNOOZED' and x.snooze_until>now() then 'SNOOZED'
          when x.latest_action='ACKNOWLEDGED' then 'ACKNOWLEDGED'
          when x.latest_action='SNOOZED' and x.snooze_until<=now() then 'SNOOZE_EXPIRED'
          else 'UNREVIEWED'
        end,
        'snooze_until',x.snooze_until,
        'latest_action_at',x.latest_action_at
      ) order by
        case
          when x.latest_action='CLOSED' then 3
          when x.latest_action='SNOOZED' and x.snooze_until>now() then 2
          when x.latest_action='ACKNOWLEDGED' then 1
          else 0
        end,
        x.priority_score desc,x.routed_at desc)
      from (
        select r.*,
               a.action latest_action,a.snooze_until,a.action_at latest_action_at
          from public.gold_signal_alert_routes r
          left join lateral (
            select aa.action,aa.snooze_until,aa.action_at
              from public.gold_signal_alert_actions aa
             where aa.alert_route_id=r.id
             order by aa.id desc
             limit 1
          ) a on true
         where r.route_state in ('DASHBOARD_ONLY','NOTIFICATION_READY')
         order by r.priority_score desc,r.routed_at desc
         limit lim
      ) x
    ),'[]'::jsonb),
    'governance',jsonb_build_object(
      'owner_only',true,'aal2_required',true,
      'actions_append_only',true,'hash_chained',true,
      'acknowledgement_is_not_trade_approval',true,
      'action_permitted','WAIT','capital_permission','0R',
      'automatic_execution',false,'live_order_submission_enabled',false
    )
  );
end;
$function$;

revoke all on function public.get_v193_gold_alert_inbox(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_v193_gold_alert_inbox(uuid,integer) to service_role;
