import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ ok:false, error:"method_not_allowed" }, {
      status:405,
      headers:{ "Allow":"GET, POST", "Cache-Control":"no-store" }
    });
  }

  return Response.json({
    ok:true,
    version:"v97.2-quant-accountability-load-shed",
    state:"LOAD_SHED_DB_RECOVERY",
    observed_at:new Date().toISOString(),
    source_mode:"INCIDENT_CIRCUIT_BREAKER",
    forecast_error:{ ok:false, state:"WITHHELD_DB_RECOVERY" },
    execution_latency:{ ok:false, state:"WITHHELD_DB_RECOVERY" },
    governance:{
      research_only:true,
      action_permitted:"WAIT",
      capital_permission:"0R",
      live_order_submission_enabled:false,
      external_effects:false,
      reason:"Database connection admission is saturated; accountability analytics are temporarily parked to release pressure."
    }
  }, {
    status:200,
    headers:{
      "Cache-Control":"private, max-age=0, no-store",
      "X-TFA-Recovery":"DB_LOAD_SHED",
      "X-Content-Type-Options":"nosniff"
    }
  });
});
