-- V172: deterministic validation plus transactional ingest/replay tests.
do $tests$
declare
 v_quote jsonb := $quote${"mode": "PAPER_DEMO", "asset": "XAUUSD", "provenance": "BROKER_DEMO_USER_SUPPLIED", "source_code": "DEMO_TEST", "provider_symbol": "XAUUSDm", "sequence": 1, "observed_at": "2026-10-01T18:00:00Z", "bid": 4200, "ask": 4200.5}$quote$::jsonb;
 v_case record;
 v_result jsonb;
 v_count integer:=0;
 v_owner uuid;
 v_before bigint;
 v_id bigint;
begin
 for v_case in select * from (values
('valid',v_quote,true,''),
('null',null::jsonb,false,'INVALID_ENVELOPE'),
('array','[]'::jsonb,false,'INVALID_ENVELOPE'),
('live_mode',jsonb_set(v_quote,'{mode}','"LIVE"'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('futures_asset',jsonb_set(v_quote,'{asset}','"GC=F"'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('invented_provenance',jsonb_set(v_quote,'{provenance}','"VERIFIED_BROKER"'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('broker_claim',jsonb_set(v_quote,'{broker_verified}','true'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('execution_claim',jsonb_set(v_quote,'{execution_grade}','true'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('live_orders',jsonb_set(v_quote,'{live_order_submission_enabled}','true'::jsonb),false,'PAPER_BOUNDARY_REQUIRED'),
('blank_source',jsonb_set(v_quote,'{source_code}','""'::jsonb),false,'INVALID_SOURCE_OR_SYMBOL'),
('bad_symbol',jsonb_set(v_quote,'{provider_symbol}','"GC=F"'::jsonb),false,'INVALID_SOURCE_OR_SYMBOL'),
('symbol_text',jsonb_set(v_quote,'{provider_symbol}','1'::jsonb),false,'INVALID_SOURCE_OR_SYMBOL'),
('missing_sequence',jsonb_set(v_quote,'{sequence}','null'::jsonb),false,'INVALID_SEQUENCE'),
('zero_sequence',jsonb_set(v_quote,'{sequence}','0'::jsonb),false,'INVALID_SEQUENCE'),
('negative_sequence',jsonb_set(v_quote,'{sequence}','-1'::jsonb),false,'INVALID_SEQUENCE'),
('fractional_sequence',jsonb_set(v_quote,'{sequence}','1.1'::jsonb),false,'INVALID_SEQUENCE'),
('string_sequence',jsonb_set(v_quote,'{sequence}','"1"'::jsonb),false,'INVALID_SEQUENCE'),
('overflow_sequence',jsonb_set(v_quote,'{sequence}','9007199254740992'::jsonb),false,'INVALID_SEQUENCE'),
('zero_bid',jsonb_set(v_quote,'{bid}','0'::jsonb),false,'INVALID_BID_ASK'),
('negative_bid',jsonb_set(v_quote,'{bid}','-1'::jsonb),false,'INVALID_BID_ASK'),
('string_bid',jsonb_set(v_quote,'{bid}','"4200"'::jsonb),false,'INVALID_BID_ASK'),
('crossed_ask',jsonb_set(v_quote,'{ask}','4199'::jsonb),false,'INVALID_BID_ASK'),
('zero_spread',jsonb_set(v_quote,'{ask}','4200'::jsonb),false,'INVALID_BID_ASK'),
('wide_spread',jsonb_set(v_quote,'{ask}','4400'::jsonb),false,'INVALID_BID_ASK'),
('missing_ask',jsonb_set(v_quote,'{ask}','null'::jsonb),false,'INVALID_BID_ASK'),
('future_quote',jsonb_set(v_quote,'{observed_at}','"2026-10-01T18:00:01Z"'::jsonb),false,'FUTURE_QUOTE'),
('stale_boundary',jsonb_set(v_quote,'{observed_at}','"2026-10-01T17:59:50Z"'::jsonb),false,'STALE_QUOTE'),
('bad_time',jsonb_set(v_quote,'{observed_at}','"not-a-time"'::jsonb),false,'INVALID_TIMESTAMP'),
('no_offset',jsonb_set(v_quote,'{observed_at}','"2026-10-01T18:00:00"'::jsonb),false,'INVALID_TIMESTAMP'),
('null_time',jsonb_set(v_quote,'{observed_at}','null'::jsonb),false,'INVALID_TIMESTAMP'),
('fresh_9_seconds',jsonb_set(v_quote,'{observed_at}','"2026-10-01T17:59:51Z"'::jsonb),true,'')
 ) x(code,quote,expected_ok,violation) loop
   v_result:=private.evaluate_v172_paper_quote(v_case.quote,'2026-10-01T18:00:00Z');
   if v_result->'ok' is distinct from to_jsonb(v_case.expected_ok)
      or (not v_case.expected_ok and not (v_result->'violations' ? v_case.violation))
      or v_result->'execution_grade' is distinct from 'false'::jsonb
      or v_result->'broker_verified' is distinct from 'false'::jsonb
      or v_result->'live_order_submission_enabled' is distinct from 'false'::jsonb
      or v_result->>'capital_permission'<>'0R' then
     raise exception 'V172 validation % failed: %',v_case.code,v_result;
   end if;
   v_count:=v_count+1;
 end loop;
 if v_count<>31 then raise exception 'V172 case count mismatch'; end if;
 if private.evaluate_v172_paper_quote(v_quote,null)->'ok' is distinct from 'false'::jsonb then
   raise exception 'Null clock accepted';
 end if;
 select user_id into v_owner from public.owner_users where active=true limit 1;
 if v_owner is null then raise exception 'Active owner required for transactional integration test'; end if;
 select count(*) into v_before from public.gold_paper_broker_quotes;
 -- Every synthetic quote row is rolled back; identity sequence gaps are expected.
 begin
   v_quote:=v_quote||jsonb_build_object('source_code','V172_TEST_'||upper(substr(md5(random()::text),1,12)),
     'observed_at',now(),'sequence',10);
   v_result:=public.ingest_v172_gold_paper_quote(null,v_quote);
   if v_result->>'error'<>'owner_only' then raise exception 'Unauthenticated owner accepted'; end if;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote);
   if v_result->'inserted' is distinct from 'true'::jsonb then raise exception 'Valid ingest failed %',v_result; end if;
   v_id:=(v_result->>'receipt_id')::bigint;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote);
   if v_result->>'state'<>'DUPLICATE_ALREADY_RECORDED' or v_result->'inserted' is distinct from 'false'::jsonb
      or (v_result->>'receipt_id')::bigint<>v_id then raise exception 'Idempotent replay failed'; end if;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote||'{"bid":4200.1}'::jsonb);
   if v_result->>'error'<>'conflicting_replay' then raise exception 'Conflicting replay accepted'; end if;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote||'{"sequence":9}'::jsonb);
   if v_result->>'error'<>'out_of_order_quote' then raise exception 'Old sequence accepted'; end if;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote||'{"sequence":11}'::jsonb);
   if v_result->>'error'<>'paper_intake_rate_limit' then raise exception 'Rate cap not enforced'; end if;
   v_result:=public.ingest_v172_gold_paper_quote(v_owner,v_quote||jsonb_build_object('sequence',11,'observed_at',now()-interval '1 second'));
   if v_result->>'error'<>'out_of_order_quote' then raise exception 'Regressive time accepted'; end if;
   if public.get_v172_gold_paper_quote_status()->'governance'->'live_order_submission_enabled' is distinct from 'false'::jsonb then
      raise exception 'Status granted orders'; end if;
   begin
     update public.gold_paper_broker_quotes set bid=4200.2 where id=v_id;
     raise exception using errcode='P1721',message='Immutable quote was updated';
   exception when sqlstate 'P0001' then null; end;
   raise exception using errcode='P1720',message='Rollback synthetic ingest evidence';
 exception when sqlstate 'P1720' then null; end;
 if (select count(*) from public.gold_paper_broker_quotes)<>v_before then raise exception 'Synthetic quote leaked'; end if;
 if has_function_privilege('anon','public.ingest_v172_gold_paper_quote(uuid,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','public.ingest_v172_gold_paper_quote(uuid,jsonb)','EXECUTE')
   or has_table_privilege('anon','public.gold_paper_broker_quotes','SELECT')
   or has_table_privilege('authenticated','public.gold_paper_broker_quotes','INSERT') then
   raise exception 'V172 access controls expanded';
 end if;
 raise notice 'V172: % validation cases plus null-clock and 9 transactional checks passed',v_count;
end;
$tests$;
