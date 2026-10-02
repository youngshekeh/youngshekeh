-- V184 Demo Broker Bridge Enrollment
-- Machine-to-machine credentials are sandbox-only and cannot unlock production capital.

create table if not exists public.gold_broker_sandbox_bridges (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  owner_user_id uuid not null,
  bridge_label text not null check (char_length(bridge_label) between 1 and 80),
  source_code text not null check (source_code ~ '^[A-Z0-9_-]{3,64}$'),
  provider_symbol text not null check (provider_symbol ~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'),
  key_sha256 text not null unique check (key_sha256 ~ '^[a-f0-9]{64}$'),
  last_used_at timestamptz,
  use_count bigint not null default 0 check (use_count>=0),
  revoked_at timestamptz,
  mode text not null default 'BROKER_DEMO_SANDBOX' check (mode='BROKER_DEMO_SANDBOX'),
  production_capable boolean not null default false check (production_capable=false),
  live_order_submission_enabled boolean not null default false check (live_order_submission_enabled=false)
);
alter table public.gold_broker_sandbox_bridges enable row level security;
revoke all on table public.gold_broker_sandbox_bridges from public,anon,authenticated;
grant select,insert,update on table public.gold_broker_sandbox_bridges to service_role;
grant usage,select on sequence public.gold_broker_sandbox_bridges_id_seq to service_role;
create unique index if not exists gold_broker_sandbox_bridges_active_source_uq on public.gold_broker_sandbox_bridges(owner_user_id,source_code) where revoked_at is null;
create index if not exists gold_broker_sandbox_bridges_active_idx on public.gold_broker_sandbox_bridges(revoked_at,last_used_at desc);

create or replace function public.create_v184_gold_sandbox_bridge(p_owner_user_id uuid,p_bridge_label text,p_source_code text,p_provider_symbol text,p_key_sha256 text)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare v_id bigint;
begin
 if p_owner_user_id is null or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true)
 then return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R'); end if;
 if p_bridge_label is null or char_length(trim(p_bridge_label)) not between 1 and 80
    or p_source_code is null or p_source_code !~ '^[A-Z0-9_-]{3,64}$'
    or p_provider_symbol is null or p_provider_symbol !~ '^XAUUSD[A-Za-z0-9._-]{0,16}$'
    or p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('ok',false,'error','invalid_bridge_configuration','capital_permission','0R'); end if;
 if exists(select 1 from public.gold_broker_sandbox_bridges where owner_user_id=p_owner_user_id and source_code=p_source_code and revoked_at is null)
 then return jsonb_build_object('ok',false,'error','active_bridge_already_exists','capital_permission','0R'); end if;
 insert into public.gold_broker_sandbox_bridges(owner_user_id,bridge_label,source_code,provider_symbol,key_sha256)
 values(p_owner_user_id,trim(p_bridge_label),p_source_code,p_provider_symbol,p_key_sha256) returning id into v_id;
 return jsonb_build_object('ok',true,'version','v184-demo-broker-bridge-v1','state','SANDBOX_BRIDGE_CREATED','bridge_id',v_id,
   'bridge_label',trim(p_bridge_label),'source_code',p_source_code,'provider_symbol',p_provider_symbol,'mode','BROKER_DEMO_SANDBOX',
   'production_capable',false,'live_order_submission_enabled',false,'capital_permission','0R');
exception when unique_violation then
 return jsonb_build_object('ok',false,'error','bridge_conflict','capital_permission','0R');
end;$function$;
revoke all on function public.create_v184_gold_sandbox_bridge(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_v184_gold_sandbox_bridge(uuid,text,text,text,text) to service_role;

create or replace function public.revoke_v184_gold_sandbox_bridge(p_owner_user_id uuid,p_bridge_id bigint)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare v_count integer;
begin
 update public.gold_broker_sandbox_bridges set revoked_at=now()
 where id=p_bridge_id and owner_user_id=p_owner_user_id and revoked_at is null;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',v_count=1,'state',case when v_count=1 then 'SANDBOX_BRIDGE_REVOKED' else 'BRIDGE_NOT_ACTIVE' end,
   'bridge_id',p_bridge_id,'capital_permission','0R','live_order_submission_enabled',false);
end;$function$;
revoke all on function public.revoke_v184_gold_sandbox_bridge(uuid,bigint) from public,anon,authenticated;
grant execute on function public.revoke_v184_gold_sandbox_bridge(uuid,bigint) to service_role;

create or replace function public.list_v184_gold_sandbox_bridges(p_owner_user_id uuid)
returns jsonb language plpgsql stable security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
begin
 if p_owner_user_id is null or not exists(select 1 from public.owner_users where user_id=p_owner_user_id and active=true)
 then return jsonb_build_object('ok',false,'error','owner_only','capital_permission','0R'); end if;
 return jsonb_build_object('ok',true,'version','v184-demo-broker-bridge-v1',
  'bridges',coalesce((select jsonb_agg(jsonb_build_object('bridge_id',id,'bridge_label',bridge_label,'source_code',source_code,
   'provider_symbol',provider_symbol,'created_at',created_at,'last_used_at',last_used_at,'use_count',use_count,'active',revoked_at is null,
   'revoked_at',revoked_at,'mode','BROKER_DEMO_SANDBOX','production_capable',false,'live_order_submission_enabled',false) order by created_at desc)
   from public.gold_broker_sandbox_bridges where owner_user_id=p_owner_user_id),'[]'::jsonb),
  'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','live_order_submission_enabled',false,'production_capable',false));
end;$function$;
revoke all on function public.list_v184_gold_sandbox_bridges(uuid) from public,anon,authenticated;
grant execute on function public.list_v184_gold_sandbox_bridges(uuid) to service_role;

create or replace function public.authenticate_v184_gold_sandbox_bridge(p_bridge_id bigint,p_key_sha256 text)
returns jsonb language plpgsql security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare v_bridge public.gold_broker_sandbox_bridges%rowtype;
begin
 if p_bridge_id is null or p_bridge_id<=0 or p_key_sha256 is null or p_key_sha256 !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('ok',false,'error','invalid_bridge_credential','capital_permission','0R'); end if;
 update public.gold_broker_sandbox_bridges set last_used_at=now(),use_count=use_count+1
 where id=p_bridge_id and key_sha256=p_key_sha256 and revoked_at is null returning * into v_bridge;
 if not found then return jsonb_build_object('ok',false,'error','invalid_bridge_credential','capital_permission','0R'); end if;
 return jsonb_build_object('ok',true,'state','SANDBOX_BRIDGE_AUTHENTICATED','bridge_id',v_bridge.id,'owner_user_id',v_bridge.owner_user_id,
  'source_code',v_bridge.source_code,'provider_symbol',v_bridge.provider_symbol,'mode','BROKER_DEMO_SANDBOX','production_capable',false,
  'live_order_submission_enabled',false,'capital_permission','0R');
end;$function$;
revoke all on function public.authenticate_v184_gold_sandbox_bridge(bigint,text) from public,anon,authenticated;
grant execute on function public.authenticate_v184_gold_sandbox_bridge(bigint,text) to service_role;

create or replace function public.get_v184_gold_sandbox_bridge_transport_status()
returns jsonb language plpgsql stable security invoker set search_path to 'pg_catalog','pg_temp'
as $function$
declare v_active integer:=0;v_total integer:=0;v_used bigint:=0;v_last timestamptz;v_state text;
begin
 select count(*)::int,count(*) filter(where revoked_at is null)::int,coalesce(sum(use_count) filter(where revoked_at is null),0)::bigint,
        max(last_used_at) filter(where revoked_at is null)
 into v_total,v_active,v_used,v_last from public.gold_broker_sandbox_bridges;
 v_state:=case when v_active=0 then 'NO_ACTIVE_SANDBOX_BRIDGE' when v_last is null then 'ACTIVE_SANDBOX_BRIDGE_NO_TRAFFIC'
   when now()-v_last<interval '2 minutes' then 'ACTIVE_SANDBOX_BRIDGE_RECENT_TRAFFIC' else 'ACTIVE_SANDBOX_BRIDGE_STALE_TRAFFIC' end;
 return jsonb_build_object('ok',true,'version','v184-demo-broker-bridge-v1','state',v_state,'checked_at',now(),
  'active_bridge_count',v_active,'bridge_count',v_total,'authenticated_requests',v_used,'last_used_at',v_last,
  'production_boundary',jsonb_build_object('production_capable',false,'production_broker_verified',false,'live_order_submission_enabled',false,'real_order_sent',false),
  'governance',jsonb_build_object('action_permitted','WAIT','capital_permission','0R','automatic_real_capital',false,'bridge_can_unlock_capital',false));
end;$function$;
revoke all on function public.get_v184_gold_sandbox_bridge_transport_status() from public,anon,authenticated;
grant execute on function public.get_v184_gold_sandbox_bridge_transport_status() to service_role;