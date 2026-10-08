Deno.serve((req:Request)=>{
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
  return Response.json({
    ok:false,
    usable:false,
    version:'runtime-v71-shadow-market-load-shed-v1',
    state:'LOAD_SHED_DB_RECOVERY',
    action:'WAIT',
    capital_permission:'0R',
    live_order_submission_enabled:false,
    automatic_execution:false,
    data_quality:'UNAVAILABLE',
    reason:'Temporary incident circuit breaker to reduce function fan-out while database connection admission recovers.',
    governance:{external_effects:false,funds_moved:false,trades_sent:false,human_release_required:true}
  },{status:200,headers:{'Cache-Control':'no-store','X-TFA-Recovery':'DB_LOAD_SHED','X-TFA-Engine':'V180-RECOVERY'}});
});
