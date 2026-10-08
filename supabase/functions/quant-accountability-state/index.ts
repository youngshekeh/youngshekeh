import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";

const directConnection = Deno.env.get("SUPABASE_DB_URL") ?? "";
function pooledConnectionString(){
  if(!directConnection)return "";
  const direct=new URL(directConnection);
  const pooled=new URL("postgres://aws-1-eu-west-1.pooler.supabase.com:6543/postgres");
  pooled.username="postgres.mpcelmjiycjpdyyflisn";
  pooled.password=decodeURIComponent(direct.password);
  pooled.searchParams.set("sslmode","require");
  return pooled.toString();
}
const connectionString=pooledConnectionString();
const sql = connectionString
  ? postgres(connectionString, { prepare: false, max: 1, idle_timeout: 2, connect_timeout: 2, max_lifetime: 30 })
  : null;

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", "Allow": "GET, POST", "Cache-Control": "no-store" }
    });
  }

  if (!sql) {
    return new Response(JSON.stringify({ ok: false, error: "database_connection_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  try {
    const rows = await sql`
      select
        public.get_v96_forecast_error_state() as v96,
        public.get_v97_execution_quality_state() as v97
    `;
    const row = rows?.[0] ?? {};
    const v96 = row.v96 ?? { ok: false, state: "UNAVAILABLE" };
    const v97 = row.v97 ?? { ok: false, state: "UNAVAILABLE" };

    return new Response(JSON.stringify({
      ok: Boolean(v96?.ok && v97?.ok),
      version: "v97.1-quant-accountability-edge-fail-fast",
      observed_at: new Date().toISOString(),
      source_mode: "DIRECT_POSTGRES_EDGE_FUNCTION",
      forecast_error: v96,
      execution_latency: v97,
      governance: {
        research_only: true,
        action_permitted: "WAIT",
        capital_permission: "0R",
        public_accuracy: "SAMPLE_GATED",
        brier: "WITHHELD_PENDING_RESOLVED_PROBABILITY_OUTCOMES"
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=0, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("quant-accountability-state", error);
    return new Response(JSON.stringify({
      ok: false,
      version: "v97.1-quant-accountability-edge-fail-fast",
      source_mode: "DIRECT_POSTGRES_EDGE_FUNCTION",
      error: "accountability_query_failed"
    }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
});