insert into private.scheduler_intelligence_cache(engine_key,payload,refreshed_at,compute_ms,refresh_count)
values('V1461',private.compute_v1461_peak_spreader_status(),now(),null,1)
on conflict(engine_key) do update
set payload=excluded.payload,
    refreshed_at=excluded.refreshed_at,
    compute_ms=excluded.compute_ms,
    refresh_count=private.scheduler_intelligence_cache.refresh_count+1;
