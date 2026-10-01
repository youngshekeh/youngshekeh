-- Deterministic behavior tests. Synthetic JSON only; no live cache or cron writes.
do $tests$
declare
  v_at timestamptz := '2026-10-01T16:00:00Z';
  v_payload jsonb := '{
    "ok":true,"version":"fixture","generated_at":"2026-10-01T16:00:00Z",
    "state":"NETWORK_SLA_CANDIDATES_READY_FOR_CONTROLLED_PLAN_REVIEW",
    "summary":{"network_sla_cleared_candidates":1,"network_candidates_audited":2},
    "evidence":[
      {"jobid":1,"jobname":"test-network-job","schedule":"7,22,37,52 * * * *",
       "network_sla_cleared":true,"protected_business":false,
       "evidence_verdict":"NETWORK_SLA_EVIDENCE_CLEARED",
       "latest_receipt_started_at":"2026-10-01T15:40:00Z","freshness_limit_minutes":35,
       "cron_runs_24h":96,"agent_receipts_24h":96},
      {"jobid":2,"jobname":"test-protected-job","network_sla_cleared":false,
       "protected_business":true,"evidence_verdict":"BLOCKED_PROTECTED_BUSINESS_WORKFLOW"}
    ]
  }'::jsonb;
  v_jobs jsonb := '[{"jobid":1,"jobname":"test-network-job","schedule":"7,22,37,52 * * * *","active":true}]';
  v_result jsonb;
  v_case record;
  v_tests integer := 0;
begin
  for v_case in select * from (values
    ('fresh',v_payload,v_at,v_at,v_jobs,null::jsonb,'FRESH',1),
    ('missing',null::jsonb,null::timestamptz,v_at,v_jobs,null::jsonb,'EMPTY_FAIL_CLOSED',0),
    ('expired_at_exact_ttl',v_payload,v_at,v_at+interval '20 minutes',v_jobs,null::jsonb,'STALE_FAIL_CLOSED',0),
    ('old_evidence_new_cache_write',jsonb_set(v_payload,'{generated_at}',to_jsonb(v_at-interval '21 minutes')),v_at,v_at,v_jobs,null::jsonb,'STALE_FAIL_CLOSED',0),
    ('future_cache',v_payload,v_at+interval '1 second',v_at,v_jobs,null::jsonb,'INVALID_FAIL_CLOSED',0),
    ('future_evidence',jsonb_set(v_payload,'{generated_at}',to_jsonb(v_at+interval '1 second')),v_at,v_at,v_jobs,null::jsonb,'INVALID_FAIL_CLOSED',0),
    ('bad_snapshot_timestamp',jsonb_set(v_payload,'{generated_at}','"not-a-date"'),v_at,v_at,v_jobs,null::jsonb,'INVALID_FAIL_CLOSED',0),
    ('receipt_expires_inside_cache_ttl',v_payload,v_at,v_at+interval '16 minutes',v_jobs,null::jsonb,'FRESH',0),
    ('receipt_at_exact_limit',v_payload,v_at,v_at+interval '15 minutes',v_jobs,null::jsonb,'FRESH',1),
    ('schedule_changed',v_payload,v_at,v_at,jsonb_set(v_jobs,'{0,schedule}','"0 * * * *"'),null::jsonb,'FRESH',0),
    ('job_disabled',v_payload,v_at,v_at,jsonb_set(v_jobs,'{0,active}','false'),null::jsonb,'FRESH',0),
    ('job_missing',v_payload,v_at,v_at,'[]'::jsonb,null::jsonb,'FRESH',0),
    ('upstream_missing',v_payload,v_at,v_at,v_jobs,'{"ok":false}'::jsonb,'FRESH',0),
    ('upstream_clear',v_payload,v_at,v_at,v_jobs,'{"ok":true,"audits":[{"jobname":"test-network-job","dependency_verdict":"REVIEW_NETWORK_SLA_AND_FAILURE_ISOLATION","direct_network_io":true}]}'::jsonb,'FRESH',1),
    ('protected_never_clears',jsonb_set(v_payload,'{evidence,0,protected_business}','true'),v_at,v_at,v_jobs,null::jsonb,'FRESH',0),
    ('string_boolean_never_clears',jsonb_set(v_payload,'{evidence,0,network_sla_cleared}','"true"'),v_at,v_at,v_jobs,null::jsonb,'FRESH',0),
    ('invalid_receipt',jsonb_set(v_payload,'{evidence,0,latest_receipt_started_at}','"bad"'),v_at,v_at,v_jobs,null::jsonb,'FRESH',0),
    ('future_receipt',jsonb_set(v_payload,'{evidence,0,latest_receipt_started_at}',to_jsonb(v_at+interval '1 second')),v_at,v_at,v_jobs,null::jsonb,'FRESH',0),
    ('invalid_limit',jsonb_set(v_payload,'{evidence,0,freshness_limit_minutes}','"NaN"'),v_at,v_at,v_jobs,null::jsonb,'FRESH',0),
    ('failed_snapshot',jsonb_set(v_payload,'{ok}','false'),v_at,v_at,v_jobs,null::jsonb,'INVALID_FAIL_CLOSED',0)
  ) as cases(name,payload,refreshed_at,as_of,jobs,upstream,cache_state,cleared)
  loop
    v_result := private.evaluate_v150_snapshot(v_case.payload,v_case.refreshed_at,v_case.as_of,v_case.jobs,v_case.upstream);
    if (v_result#>>'{_cache,state}') is distinct from v_case.cache_state
       or (v_result#>>'{summary,network_sla_cleared_candidates}')::int is distinct from v_case.cleared
       or (v_result->>'network_sla_cleared')::boolean is distinct from (v_case.cleared>0)
       or (select count(*) from jsonb_array_elements(v_result->'evidence') e where (e->>'network_sla_cleared')::boolean)
          <> v_case.cleared then
      raise exception 'V170 failed case %: %',v_case.name,v_result;
    end if;
    if v_case.payload is not null and (
      (v_result#>'{evidence,0,cron_runs_24h}') is distinct from '96'::jsonb
      or (v_result#>>'{evidence,1,evidence_verdict}') is distinct from 'BLOCKED_PROTECTED_BUSINESS_WORKFLOW'
    ) then
      raise exception 'V170 changed historical measurements or protected verdict: %',v_case.name;
    end if;
    if v_result#>>'{governance,capital_permission}'<>'0R'
       or v_result#>>'{governance,action_permitted}'<>'WAIT'
       or (v_result#>>'{governance,live_order_routing}')::boolean
       or (v_result#>>'{governance,automatic_rescheduling}')::boolean then
      raise exception 'V170 governance regression: %',v_case.name;
    end if;
    v_tests := v_tests+1;
  end loop;
  raise notice 'V170 passed % deterministic cases',v_tests;
end;
$tests$;
