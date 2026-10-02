create or replace function public.capture_v202_gold_relay_event(p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path=public,extensions,pg_temp
as $$
declare
  v_state text;
  v_next text;
  v_now timestamptz := now();
  v_latest public.gold_live_relay_events_v202%rowtype;
  v_payload jsonb;
  v_material jsonb;
  v_fingerprint text;
  v_previous_hash text;
  v_event_hash text;
  v_id bigint;
  v_age integer;
  v_bridge boolean;
  v_auth boolean;
  v_first boolean;
  v_stream boolean;
  v_auth_requests bigint;
  v_accepted_ticks bigint;
begin
  if jsonb_typeof(p_event) is distinct from 'object' then
    return jsonb_build_object('ok',false,'error','invalid_event','capital_permission','0R');
  end if;

  v_state := upper(trim(coalesce(p_event->>'state','')));
  v_next := nullif(trim(coalesce(p_event->>'next_step_code','')),'');
  if v_state !~ '^[A-Z0-9_-]{3,96}$' then
    return jsonb_build_object('ok',false,'error','invalid_state','capital_permission','0R');
  end if;

  if coalesce(p_event->>'action_permitted','WAIT') <> 'WAIT'
     or coalesce(p_event->>'capital_permission','0R') <> '0R'
     or coalesce((p_event->>'automatic_execution')::boolean,false) <> false
     or coalesce((p_event->>'live_order_submission_enabled')::boolean,false) <> false then
    return jsonb_build_object('ok',false,'error','unsafe_governance_rejected','capital_permission','0R');
  end if;

  v_bridge := coalesce((p_event->>'bridge_enrolled')::boolean,false);
  v_auth := coalesce((p_event->>'authentication_reached')::boolean,false);
  v_first := coalesce((p_event->>'first_tick_seen')::boolean,false);
  v_stream := coalesce((p_event->>'sustained_stream')::boolean,false);

  begin
    v_auth_requests := greatest(0,coalesce((p_event->>'authenticated_requests')::bigint,0));
    v_accepted_ticks := greatest(0,coalesce((p_event->>'accepted_ticks')::bigint,0));
    v_age := case when p_event ? 'latest_tick_age_seconds' and p_event->>'latest_tick_age_seconds' <> ''
      then greatest(0,(p_event->>'latest_tick_age_seconds')::integer) else null end;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('ok',false,'error','invalid_numeric_field','capital_permission','0R');
  end;

  v_payload := jsonb_build_object(
    'state',v_state,
    'next_step_code',v_next,
    'bridge_enrolled',v_bridge,
    'authentication_reached',v_auth,
    'first_tick_seen',v_first,
    'sustained_stream',v_stream,
    'authenticated_requests',v_auth_requests,
    'accepted_ticks',v_accepted_ticks,
    'latest_tick_age_seconds',v_age,
    'source_version',coalesce(nullif(p_event->>'source_version',''),'v199-gold-relay-observability-v1')
  );

  v_material := jsonb_build_object(
    'state',v_state,
    'next_step_code',v_next,
    'bridge_enrolled',v_bridge,
    'authentication_reached',v_auth,
    'first_tick_seen',v_first,
    'sustained_stream',v_stream
  );

  v_fingerprint := encode(extensions.digest(convert_to(v_material::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('v202_gold_relay_event_ledger',202));

  select * into v_latest
  from public.gold_live_relay_events_v202
  order by id desc
  limit 1;

  if found
     and v_latest.event_state=v_state
     and coalesce(v_latest.next_step_code,'')=coalesce(v_next,'')
     and v_latest.bridge_enrolled=v_bridge
     and v_latest.authentication_reached=v_auth
     and v_latest.first_tick_seen=v_first
     and v_latest.sustained_stream=v_stream then
    return jsonb_build_object(
      'ok',true,'version','v202-gold-relay-event-ledger-v1','state','UNCHANGED',
      'inserted',false,'event_id',v_latest.id,'event_state',v_state,'capital_permission','0R'
    );
  end if;

  v_previous_hash := case when v_latest.id is null then null else v_latest.event_sha256 end;
  v_event_hash := encode(
    extensions.digest(
      convert_to(coalesce(v_previous_hash,'GENESIS') || '|' || v_state || '|' || v_fingerprint || '|' || v_now::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  insert into public.gold_live_relay_events_v202(
    event_at,event_state,previous_state,next_step_code,bridge_enrolled,authentication_reached,
    first_tick_seen,sustained_stream,authenticated_requests,accepted_ticks,latest_tick_age_seconds,
    source_version,payload,state_fingerprint,previous_event_sha256,event_sha256,
    action_permitted,capital_permission,automatic_execution,live_order_submission_enabled
  ) values (
    v_now,v_state,case when v_latest.id is null then null else v_latest.event_state end,
    v_next,v_bridge,v_auth,v_first,v_stream,v_auth_requests,v_accepted_ticks,v_age,
    coalesce(nullif(p_event->>'source_version',''),'v199-gold-relay-observability-v1'),
    v_payload,v_fingerprint,v_previous_hash,v_event_hash,'WAIT','0R',false,false
  ) returning id into v_id;

  return jsonb_build_object(
    'ok',true,'version','v202-gold-relay-event-ledger-v1','state','EVENT_RECORDED',
    'inserted',true,'event_id',v_id,'event_state',v_state,
    'previous_state',case when v_latest.id is null then null else v_latest.event_state end,
    'event_sha256',v_event_hash,'capital_permission','0R'
  );
end;
$$;

revoke all on function public.capture_v202_gold_relay_event(jsonb) from public, anon, authenticated;
grant execute on function public.capture_v202_gold_relay_event(jsonb) to service_role;
