Deno.serve((req:Request)=>{
  if(req.method!=='GET'&&req.method!=='POST'&&req.method!=='OPTIONS')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET, POST, OPTIONS','Cache-Control':'no-store'}});
  if(req.method==='OPTIONS')return new Response('ok',{status:200,headers:{'Cache-Control':'no-store'}});
  return Response.json({
    ok:false,
    usable:false,
    version:'sync-member-alerts-load-shed-v1',
    state:'LOAD_SHED_DB_RECOVERY',
    action:'WAIT',
    capital_permission:'0R',
    live_order_submission_enabled:false,
    automatic_execution:false,
    external_effects:false,
    reason:'Temporary incident circuit breaker to remove noncritical database pressure during Postgres admission recovery.',
    governance:{funds_moved:false,trades_sent:false,human_release_required:true}
  },{status:200,headers:{'Cache-Control':'no-store','X-TFA-Recovery':'DB_LOAD_SHED','X-TFA-Engine':'V180-RECOVERY'}});
});
