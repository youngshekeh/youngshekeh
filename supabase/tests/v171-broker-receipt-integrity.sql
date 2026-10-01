-- V171 deterministic semantic-mutation cases. No table or cron writes.
do $tests$
declare
  v_fixture jsonb := $fixture$[{"event_seq": 1, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "DRY_RUN_LIFECYCLE", "event_type": "ORDER_PREPARED", "state": "PREPARED", "side": "LONG", "client_order_id": "A", "idempotency_key": "K-A", "payload": {"route": "SIMULATED_ONLY"}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 2, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "DRY_RUN_LIFECYCLE", "event_type": "DRY_RUN_ACK", "state": "ACKNOWLEDGED", "side": "LONG", "client_order_id": "A", "idempotency_key": "K-A", "payload": {"broker_order_id": "SIM-ACK-A"}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 3, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "DRY_RUN_LIFECYCLE", "event_type": "DRY_RUN_FILL", "state": "FILLED_SIMULATED", "side": "LONG", "client_order_id": "A", "idempotency_key": "K-A", "payload": {"fill_basis": "DETERMINISTIC_TEST_VECTOR"}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": 4200.25, "real_order_sent": false}, {"event_seq": 4, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "IDEMPOTENCY", "event_type": "DUPLICATE_BLOCKED", "state": "BLOCKED_DUPLICATE_KEY", "side": "LONG", "client_order_id": "A-DUP", "idempotency_key": "K-A", "payload": {"duplicate_of": "A"}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 5, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "KILL_SWITCH", "event_type": "ORDER_PREPARED", "state": "PREPARED", "side": "SHORT", "client_order_id": "KILL", "idempotency_key": "K-KILL", "payload": {"kill_switch": true}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 6, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "KILL_SWITCH", "event_type": "KILL_SWITCH_BLOCKED", "state": "BLOCKED_KILL_SWITCH", "side": "SHORT", "client_order_id": "KILL", "idempotency_key": "K-KILL", "payload": {"kill_switch": true}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 7, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "LIVE_ROUTE_DENIAL", "event_type": "LIVE_SUBMIT_BLOCKED", "state": "BLOCKED_NO_LIVE_ROUTE", "side": "LONG", "client_order_id": "LIVE", "idempotency_key": "K-LIVE", "payload": {"live_route_present": false}, "requested_r": 0.1, "requested_price": 4200, "simulated_fill_price": null, "real_order_sent": false}, {"event_seq": 8, "event_at": "2026-10-01T12:00:00+00:00", "run_id": 1, "scenario_code": "AUTHZ_DENIAL", "event_type": "UNAUTHORIZED_SUBMIT_BLOCKED", "state": "BLOCKED_UNAUTHORIZED", "side": "NONE", "client_order_id": "AUTH", "idempotency_key": "K-AUTH", "payload": {"authorized": false}, "requested_r": null, "requested_price": null, "simulated_fill_price": null, "real_order_sent": false}]$fixture$::jsonb;
  v_case record;
  v_result jsonb;
  v_count integer := 0;
begin
  for v_case in select * from (values
('valid_fixture', v_fixture, true, ''),
('sql_null', null::jsonb, false, 'INVALID_ENVELOPE'),
('object', '{}'::jsonb, false, 'INVALID_ENVELOPE'),
('empty', '[]'::jsonb, false, 'EVENT_COUNT_MISMATCH'),
('missing_ack', v_fixture - 1, false, 'EVENT_COUNT_MISMATCH'),
('extra_fill', v_fixture || (v_fixture->2), false, 'EVENT_COUNT_MISMATCH'),
('out_of_order_sequence', jsonb_set(v_fixture, '{2,event_seq}', '2'::jsonb), false, 'EVENT_CONTRACT_3'),
('wrong_ack_state', jsonb_set(v_fixture, '{1,state}', '"FILLED_SIMULATED"'::jsonb), false, 'EVENT_CONTRACT_2'),
('mismatched_ack_id', jsonb_set(v_fixture, '{1,client_order_id}', '"OTHER"'::jsonb), false, 'LIFECYCLE_CORRELATION_2'),
('mismatched_fill_id', jsonb_set(v_fixture, '{2,client_order_id}', '"OTHER"'::jsonb), false, 'LIFECYCLE_CORRELATION_3'),
('mismatched_fill_key', jsonb_set(v_fixture, '{2,idempotency_key}', '"OTHER"'::jsonb), false, 'LIFECYCLE_CORRELATION_3'),
('mismatched_fill_risk', jsonb_set(v_fixture, '{2,requested_r}', '0.2'::jsonb), false, 'LIFECYCLE_CORRELATION_3'),
('mismatched_fill_request_price', jsonb_set(v_fixture, '{2,requested_price}', '4201'::jsonb), false, 'LIFECYCLE_CORRELATION_3'),
('duplicate_key_not_reused', jsonb_set(v_fixture, '{3,idempotency_key}', '"OTHER"'::jsonb), false, 'DUPLICATE_CORRELATION'),
('duplicate_wrong_parent', jsonb_set(v_fixture, '{3,payload,duplicate_of}', '"OTHER"'::jsonb), false, 'DUPLICATE_CORRELATION'),
('duplicate_same_client', jsonb_set(v_fixture, '{3,client_order_id}', '"A"'::jsonb), false, 'DUPLICATE_CORRELATION'),
('kill_switch_not_set', jsonb_set(v_fixture, '{4,payload,kill_switch}', 'false'::jsonb), false, 'KILL_SWITCH_CORRELATION'),
('kill_switch_not_enforced', jsonb_set(v_fixture, '{5,payload,kill_switch}', 'false'::jsonb), false, 'KILL_SWITCH_CORRELATION'),
('kill_wrong_order', jsonb_set(v_fixture, '{5,client_order_id}', '"OTHER"'::jsonb), false, 'KILL_SWITCH_CORRELATION'),
('fill_after_kill', jsonb_set(v_fixture, '{5,simulated_fill_price}', '4200'::jsonb), false, 'UNEXPECTED_FILL_6'),
('fill_after_denial', jsonb_set(v_fixture, '{6,simulated_fill_price}', '4200'::jsonb), false, 'UNEXPECTED_FILL_7'),
('live_order_sent', jsonb_set(v_fixture, '{2,real_order_sent}', 'true'::jsonb), false, 'EVENT_CONTRACT_3'),
('missing_live_order_flag', jsonb_set(v_fixture, '{2,real_order_sent}', 'null'::jsonb), false, 'EVENT_CONTRACT_3'),
('negative_fill', jsonb_set(v_fixture, '{2,simulated_fill_price}', '-1'::jsonb), false, 'INVALID_FILL'),
('string_fill', jsonb_set(v_fixture, '{2,simulated_fill_price}', '"4200.25"'::jsonb), false, 'INVALID_FILL'),
('negative_risk', jsonb_set(v_fixture, '{0,requested_r}', '-0.1'::jsonb), false, 'INVALID_REQUEST_1'),
('oversized_risk', jsonb_set(v_fixture, '{0,requested_r}', '2'::jsonb), false, 'INVALID_REQUEST_1'),
('string_price', jsonb_set(v_fixture, '{0,requested_price}', '"4200"'::jsonb), false, 'INVALID_REQUEST_1'),
('missing_id', jsonb_set(v_fixture, '{0,client_order_id}', 'null'::jsonb), false, 'EVENT_CONTRACT_1'),
('wrong_run', jsonb_set(v_fixture, '{2,run_id}', '2'::jsonb), false, 'EVENT_CONTRACT_3'),
('scenario_id_collision', jsonb_set(v_fixture, '{6,idempotency_key}', '"K-KILL"'::jsonb), false, 'CROSS_SCENARIO_ID_COLLISION'),
('non_simulated_route', jsonb_set(v_fixture, '{0,payload,route}', '"LIVE"'::jsonb), false, 'SIMULATION_BOUNDARY'),
('non_simulated_ack', jsonb_set(v_fixture, '{1,payload,broker_order_id}', '"REAL-ACK"'::jsonb), false, 'SIMULATION_BOUNDARY'),
('live_route_present', jsonb_set(v_fixture, '{6,payload,live_route_present}', 'true'::jsonb), false, 'SIMULATION_BOUNDARY'),
('authorized_submit', jsonb_set(v_fixture, '{7,payload,authorized}', 'true'::jsonb), false, 'SIMULATION_BOUNDARY'),
('unauthorized_risk', jsonb_set(v_fixture, '{7,requested_r}', '0.1'::jsonb), false, 'UNAUTHORIZED_REQUEST_FIELDS'),
('time_reversal', jsonb_set(v_fixture, '{2,event_at}', '"2026-10-01T11:59:59+00:00"'::jsonb), false, 'EVENT_TIME_3'),
('malformed_time', jsonb_set(v_fixture, '{2,event_at}', '"not-a-time"'::jsonb), false, 'EVENT_TIME_3'),
('missing_time', jsonb_set(v_fixture, '{2,event_at}', 'null'::jsonb), false, 'EVENT_TIME_3'),
('valid_changed_prices', replace(v_fixture::text,'4200','4300')::jsonb, true, ''),
('valid_changed_ids', replace(v_fixture::text,'"A"','"B"')::jsonb, true, '')
  ) t(code,events,expected_ok,expected_violation) loop
    v_result := private.evaluate_v171_broker_lab_receipts(v_case.events);
    if (v_result->'ok') is distinct from to_jsonb(v_case.expected_ok)
       or v_result->>'production_broker_readiness' <> 'NOT_TESTED'
       or v_result->>'real_capital_permission' <> '0R'
       or v_result->'live_order_submission_enabled' is distinct from 'false'::jsonb
       or (not v_case.expected_ok and not (v_result->'violations' ? v_case.expected_violation)) then
      raise exception 'V171 case % failed: %',v_case.code,v_result;
    end if;
    v_count:=v_count+1;
  end loop;
  if v_count<>41 then raise exception 'V171 case count mismatch'; end if;
  if has_function_privilege('anon','private.evaluate_v171_broker_lab_receipts(jsonb)','execute')
     or has_function_privilege('authenticated','private.evaluate_v171_broker_lab_receipts(jsonb)','execute')
     or not has_function_privilege('service_role','private.evaluate_v171_broker_lab_receipts(jsonb)','execute') then
    raise exception 'V171 privilege assertion failed';
  end if;
  raise notice 'V171: %/% semantic cases passed',v_count,v_count;
end;
$tests$;
