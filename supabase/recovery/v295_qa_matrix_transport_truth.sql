-- V295 audited in-place repair. Preserve existing SECURITY DEFINER, locked function grants,
-- search_path, schedules, historic QA rows and permissions. No synthetic QA success.
CREATE OR REPLACE FUNCTION public.reconcile_v78_qa_probes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net', 'extensions', 'pg_temp'
AS $function$
declare
  p record;
  r record;
  b jsonb;
  v_state text;
  v_passed integer;
  v_failed integer;
  v_total integer;
  v_hash text;
  v_inserted integer := 0;
  v_transport_failures integer := 0;
  v_matrix_valid boolean := false;
  v_actual_total integer := 0;
  v_actual_passed integer := 0;
  v_actual_failed integer := 0;
begin
  for p in
    select id,request_id
    from public.autonomous_external_probes
    where probe_kind='v78_qa_matrix'
      and resolved_at is null
      and requested_at <= now() - interval '4 seconds'
    order by requested_at asc
    limit 20
  loop
    select status_code,content,timed_out,error_msg
    into r
    from net._http_response
    where id=p.request_id
    order by created desc
    limit 1;

    if not found then continue; end if;

    begin
      b := coalesce(r.content,'{}')::jsonb;
    exception when others then
      b := '{}'::jsonb;
    end;

    -- V295: a non-200/timeout or partial response is NOT a full QA matrix.
    v_matrix_valid := coalesce(r.status_code,0)=200
      and coalesce(r.timed_out,false)=false
      and jsonb_typeof(b)='object'
      and coalesce(b->>'version','') ~ '^v[0-9]'
      and b->>'version'<>'v78-unknown'
      and b->>'state' in ('PASS','FAIL','DEGRADED','INCOMPLETE')
      and jsonb_typeof(b->'tests')='array'
      and case when jsonb_typeof(b->'tests')='array'
        then jsonb_array_length(b->'tests')>=100 else false end
      and jsonb_typeof(b->'invariants')='object'
      and b#>>'{invariants,capital_permission}'='0R'
      and coalesce(b#>>'{summary,passed}','') ~ '^[0-9]{1,4}
      else coalesce(b->>'state','FAIL')
    end;
    v_passed := coalesce(nullif(b#>>'{summary,passed}','')::integer,0);
    v_failed := coalesce(nullif(b#>>'{summary,failed}','')::integer,1);
    v_total := coalesce(nullif(b#>>'{summary,total}','')::integer,v_passed+v_failed);

    v_hash := encode(
      extensions.digest(
        convert_to(
          concat_ws('|',
            coalesce(b->>'version','v78-unknown'),
            coalesce(b->>'checked_at',now()::text),
            v_state,
            v_passed::text,
            v_failed::text,
            coalesce((b->'tests')::text,'[]'),
            coalesce((b->'invariants')::text,'{}')
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.autonomous_qa_runs(
      checked_at,version,state,passed,failed,total,max_latency_ms,tests,invariants,evidence_hash
    ) values (
      coalesce(nullif(b->>'checked_at','')::timestamptz,now()),
      coalesce(b->>'version','v78-unknown'),
      v_state,v_passed,v_failed,v_total,
      round(nullif(b#>>'{summary,max_latency_ms}','')::numeric)::integer,
      coalesce(b->'tests','[]'::jsonb),
      coalesce(b->'invariants','{}'::jsonb),
      v_hash
    );
    v_inserted := v_inserted + 1;

    update public.autonomous_external_probes
    set resolved_at=now(),
        http_status=r.status_code,
        ok=(v_failed=0 and v_state='PASS'),
        details=jsonb_build_object(
          'state',v_state,'passed',v_passed,'failed',v_failed,'total',v_total,
          'version',b->>'version','evidence_hash',v_hash,
          'timed_out',coalesce(r.timed_out,false),'error_msg',r.error_msg
        )
    where id=p.id;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v78_regression_matrix',
      case when v_failed=0 and v_state='PASS' then 'watch' when v_failed<=2 then 'important' else 'critical' end,
      'qa',
      case when v_failed=0 and v_state='PASS' then 'cleared' else 'open' end,
      'V78 autonomous regression matrix',
      format('%s/%s production invariants passed; state %s.',v_passed,v_total,v_state),
      jsonb_build_object('passed',v_passed,'failed',v_failed,'total',v_total,'evidence_hash',v_hash),
      now(),
      case when v_failed=0 and v_state='PASS' then now() else null end,
      now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,updated_at=excluded.updated_at;
  end loop;

  return jsonb_build_object('ok',true,'inserted_runs',v_inserted,
    'transport_failures',v_transport_failures,
    'qa_certified_by_reconciliation',false,'checked_at',now());
end;
$function$

      and coalesce(b#>>'{summary,failed}','') ~ '^[0-9]{1,4}
      else coalesce(b->>'state','FAIL')
    end;
    v_passed := coalesce(nullif(b#>>'{summary,passed}','')::integer,0);
    v_failed := coalesce(nullif(b#>>'{summary,failed}','')::integer,1);
    v_total := coalesce(nullif(b#>>'{summary,total}','')::integer,v_passed+v_failed);

    v_hash := encode(
      extensions.digest(
        convert_to(
          concat_ws('|',
            coalesce(b->>'version','v78-unknown'),
            coalesce(b->>'checked_at',now()::text),
            v_state,
            v_passed::text,
            v_failed::text,
            coalesce((b->'tests')::text,'[]'),
            coalesce((b->'invariants')::text,'{}')
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.autonomous_qa_runs(
      checked_at,version,state,passed,failed,total,max_latency_ms,tests,invariants,evidence_hash
    ) values (
      coalesce(nullif(b->>'checked_at','')::timestamptz,now()),
      coalesce(b->>'version','v78-unknown'),
      v_state,v_passed,v_failed,v_total,
      round(nullif(b#>>'{summary,max_latency_ms}','')::numeric)::integer,
      coalesce(b->'tests','[]'::jsonb),
      coalesce(b->'invariants','{}'::jsonb),
      v_hash
    );
    v_inserted := v_inserted + 1;

    update public.autonomous_external_probes
    set resolved_at=now(),
        http_status=r.status_code,
        ok=(v_failed=0 and v_state='PASS'),
        details=jsonb_build_object(
          'state',v_state,'passed',v_passed,'failed',v_failed,'total',v_total,
          'version',b->>'version','evidence_hash',v_hash,
          'timed_out',coalesce(r.timed_out,false),'error_msg',r.error_msg
        )
    where id=p.id;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v78_regression_matrix',
      case when v_failed=0 and v_state='PASS' then 'watch' when v_failed<=2 then 'important' else 'critical' end,
      'qa',
      case when v_failed=0 and v_state='PASS' then 'cleared' else 'open' end,
      'V78 autonomous regression matrix',
      format('%s/%s production invariants passed; state %s.',v_passed,v_total,v_state),
      jsonb_build_object('passed',v_passed,'failed',v_failed,'total',v_total,'evidence_hash',v_hash),
      now(),
      case when v_failed=0 and v_state='PASS' then now() else null end,
      now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,updated_at=excluded.updated_at;
  end loop;

  return jsonb_build_object('ok',true,'inserted_runs',v_inserted,'checked_at',now());
end;
$function$

      and coalesce(b#>>'{summary,total}','') ~ '^[0-9]{1,4}
      else coalesce(b->>'state','FAIL')
    end;
    v_passed := coalesce(nullif(b#>>'{summary,passed}','')::integer,0);
    v_failed := coalesce(nullif(b#>>'{summary,failed}','')::integer,1);
    v_total := coalesce(nullif(b#>>'{summary,total}','')::integer,v_passed+v_failed);

    v_hash := encode(
      extensions.digest(
        convert_to(
          concat_ws('|',
            coalesce(b->>'version','v78-unknown'),
            coalesce(b->>'checked_at',now()::text),
            v_state,
            v_passed::text,
            v_failed::text,
            coalesce((b->'tests')::text,'[]'),
            coalesce((b->'invariants')::text,'{}')
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.autonomous_qa_runs(
      checked_at,version,state,passed,failed,total,max_latency_ms,tests,invariants,evidence_hash
    ) values (
      coalesce(nullif(b->>'checked_at','')::timestamptz,now()),
      coalesce(b->>'version','v78-unknown'),
      v_state,v_passed,v_failed,v_total,
      round(nullif(b#>>'{summary,max_latency_ms}','')::numeric)::integer,
      coalesce(b->'tests','[]'::jsonb),
      coalesce(b->'invariants','{}'::jsonb),
      v_hash
    );
    v_inserted := v_inserted + 1;

    update public.autonomous_external_probes
    set resolved_at=now(),
        http_status=r.status_code,
        ok=(v_failed=0 and v_state='PASS'),
        details=jsonb_build_object(
          'state',v_state,'passed',v_passed,'failed',v_failed,'total',v_total,
          'version',b->>'version','evidence_hash',v_hash,
          'timed_out',coalesce(r.timed_out,false),'error_msg',r.error_msg
        )
    where id=p.id;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v78_regression_matrix',
      case when v_failed=0 and v_state='PASS' then 'watch' when v_failed<=2 then 'important' else 'critical' end,
      'qa',
      case when v_failed=0 and v_state='PASS' then 'cleared' else 'open' end,
      'V78 autonomous regression matrix',
      format('%s/%s production invariants passed; state %s.',v_passed,v_total,v_state),
      jsonb_build_object('passed',v_passed,'failed',v_failed,'total',v_total,'evidence_hash',v_hash),
      now(),
      case when v_failed=0 and v_state='PASS' then now() else null end,
      now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,updated_at=excluded.updated_at;
  end loop;

  return jsonb_build_object('ok',true,'inserted_runs',v_inserted,'checked_at',now());
end;
$function$
;
    if v_matrix_valid then
      v_passed := (b#>>'{summary,passed}')::integer;
      v_failed := (b#>>'{summary,failed}')::integer;
      v_total := (b#>>'{summary,total}')::integer;
      select count(*)::integer,
        count(*) filter(where t->>'pass'='true')::integer,
        count(*) filter(where t->>'pass'='false')::integer
      into v_actual_total,v_actual_passed,v_actual_failed
      from jsonb_array_elements(b->'tests') t;
      v_matrix_valid := v_total between 100 and 1000
        and v_total=v_passed+v_failed
        and v_actual_total=v_total
        and v_actual_passed=v_passed
        and v_actual_failed=v_failed
        and (b->>'state'<>'PASS' or (v_failed=0 and b->>'ok'='true'));
    end if;
    if not v_matrix_valid then
      v_transport_failures := v_transport_failures+1;
      update public.autonomous_external_probes
      set resolved_at=now(),http_status=r.status_code,ok=false,
          details=jsonb_build_object('state','QA_TRANSPORT_UNVERIFIED',
            'complete_matrix_received',false,'request_id',p.request_id,
            'http_status',r.status_code,
            'timed_out',coalesce(r.timed_out,false),
            'qa_matrix_certified',false,'capital_permission','0R')
      where id=p.id;
      insert into public.autonomous_ops_events(
        event_key,severity,category,state,title,summary,details,
        observed_at,cleared_at,updated_at
      ) values (
        'ops:v78_regression_matrix','critical','qa','open',
        'Private QA matrix unavailable',
        'Private QA transport did not deliver a complete verified matrix; commercial release HOLD.',
        jsonb_build_object('complete_matrix_received',false,
          'transport_state','QA_TRANSPORT_UNVERIFIED',
          'http_status',r.status_code,'timed_out',coalesce(r.timed_out,false),
          'request_id',p.request_id,'capital_permission','0R'),
        now(),null,now()
      )
      on conflict(event_key) do update set
        severity=excluded.severity,category=excluded.category,
        state=excluded.state,title=excluded.title,summary=excluded.summary,
        details=excluded.details,observed_at=excluded.observed_at,
        cleared_at=null,updated_at=excluded.updated_at;
      continue;
    end if;

    v_state := case
      when coalesce(r.status_code,0)<>200 then 'FAIL'
      else coalesce(b->>'state','FAIL')
    end;
    v_passed := coalesce(nullif(b#>>'{summary,passed}','')::integer,0);
    v_failed := coalesce(nullif(b#>>'{summary,failed}','')::integer,1);
    v_total := coalesce(nullif(b#>>'{summary,total}','')::integer,v_passed+v_failed);

    v_hash := encode(
      extensions.digest(
        convert_to(
          concat_ws('|',
            coalesce(b->>'version','v78-unknown'),
            coalesce(b->>'checked_at',now()::text),
            v_state,
            v_passed::text,
            v_failed::text,
            coalesce((b->'tests')::text,'[]'),
            coalesce((b->'invariants')::text,'{}')
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.autonomous_qa_runs(
      checked_at,version,state,passed,failed,total,max_latency_ms,tests,invariants,evidence_hash
    ) values (
      coalesce(nullif(b->>'checked_at','')::timestamptz,now()),
      coalesce(b->>'version','v78-unknown'),
      v_state,v_passed,v_failed,v_total,
      round(nullif(b#>>'{summary,max_latency_ms}','')::numeric)::integer,
      coalesce(b->'tests','[]'::jsonb),
      coalesce(b->'invariants','{}'::jsonb),
      v_hash
    );
    v_inserted := v_inserted + 1;

    update public.autonomous_external_probes
    set resolved_at=now(),
        http_status=r.status_code,
        ok=(v_failed=0 and v_state='PASS'),
        details=jsonb_build_object(
          'state',v_state,'passed',v_passed,'failed',v_failed,'total',v_total,
          'version',b->>'version','evidence_hash',v_hash,
          'timed_out',coalesce(r.timed_out,false),'error_msg',r.error_msg
        )
    where id=p.id;

    insert into public.autonomous_ops_events(
      event_key,severity,category,state,title,summary,details,observed_at,cleared_at,updated_at
    ) values (
      'ops:v78_regression_matrix',
      case when v_failed=0 and v_state='PASS' then 'watch' when v_failed<=2 then 'important' else 'critical' end,
      'qa',
      case when v_failed=0 and v_state='PASS' then 'cleared' else 'open' end,
      'V78 autonomous regression matrix',
      format('%s/%s production invariants passed; state %s.',v_passed,v_total,v_state),
      jsonb_build_object('passed',v_passed,'failed',v_failed,'total',v_total,'evidence_hash',v_hash),
      now(),
      case when v_failed=0 and v_state='PASS' then now() else null end,
      now()
    )
    on conflict(event_key) do update set
      severity=excluded.severity,category=excluded.category,state=excluded.state,title=excluded.title,
      summary=excluded.summary,details=excluded.details,observed_at=excluded.observed_at,
      cleared_at=excluded.cleared_at,updated_at=excluded.updated_at;
  end loop;

  return jsonb_build_object('ok',true,'inserted_runs',v_inserted,'checked_at',now());
end;
$function$
;
