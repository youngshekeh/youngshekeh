-- Exact original production enqueue function, read October 25, 2026. Apply only on explicit rollback.
CREATE OR REPLACE FUNCTION public.enqueue_v78_qa_probe()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net', 'pg_temp'
AS $function$
declare
  v_request_id bigint;
begin
  select net.http_get(
    url := 'https://thefatheranalytics.com/api/autonomous-qa-matrix',
    headers := jsonb_build_object('Accept','application/json','User-Agent','THE-FATHER-ANALYTICS-DB/78.0'),
    timeout_milliseconds := 20000
  ) into v_request_id;

  insert into public.autonomous_external_probes(probe_kind,request_id,requested_at)
  values('v78_qa_matrix',v_request_id,now())
  on conflict(request_id) do nothing;

  return v_request_id;
end;
$function$;
