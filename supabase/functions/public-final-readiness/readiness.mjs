import {sourceCurrent,incidentObservation,sourceEvidence,cacheLifetime} from '../_shared/public-launch-observation.mjs';
export const FINAL_PATHS=Object.freeze(['public-auth-runtime-check','public-access-readiness',
 'public-v66-runtime-observatory','public-billing-acceptance','public-v69-database-incident-shield']);
export function finalCacheTtl(body){return cacheLifetime(body,body.hard_blockers.length?60000:120000);}
export function assembleFinalReadiness(records,now=Date.now()){
 const [auth,access,runtime,billing,incident]=FINAL_PATHS.map(path=>records[path]);
 const a=auth?.body??{},x=access?.body??{},r=runtime?.body??{},b=billing?.body??{};
 const aOk=sourceCurrent(auth,now),xOk=sourceCurrent(access,now),rOk=sourceCurrent(runtime,now);
 const bOk=sourceCurrent(billing,now)&&b.version==='billing-acceptance-v1';
 const db=incidentObservation(incident,now);
 const preflight=bOk&&b.ready_for_checkout===true&&b.gates?.merchant_credentials==='PASS'
  &&b.gates?.provider_plan_parity==='PASS';
 const live=bOk&&b.state==='LIVE_FLOW_VERIFIED'&&b.live_flow_verified===true
  &&b.gates?.signed_payment_evidence==='PASS'&&b.gates?.paid_checkout_evidence==='PASS'
  &&b.gates?.active_entitlement_evidence==='PASS';
 const entitlement=bOk&&b.gates?.active_entitlement_evidence==='PASS';
 const gates=[
  {key:'database_incident',passed:db.active===false,state:db.state,kind:'hard'},
  {key:'provider_rate_limit',passed:null,state:'UNVERIFIED_EXTERNALLY',kind:'external_unknown'},
  {key:'auth_runtime',passed:aOk&&a.state==='PASSWORD_AUTH_READY'&&a.auth_health?.ok===true
   &&a.auth_settings?.ok===true&&a.auth_settings?.email_password===true,state:aOk?(a.state||'UNVERIFIED'):'UNVERIFIED',kind:'hard'},
  {key:'direct_access',passed:xOk&&x.routing?.direct_edge_ready===true,state:xOk&&x.routing?.direct_edge_ready===true?'READY':'UNVERIFIED',kind:'hard'},
  {key:'canonical_routes',passed:xOk&&x.routing?.canonical_ready===true,state:xOk&&x.routing?.canonical_ready===true?'READY':'PENDING',kind:'acceptance'},
  {key:'runtime_baseline',passed:rOk&&['BASELINE_READY','PARTIAL'].includes(r.certification_state),state:rOk?(r.certification_state||'UNVERIFIED'):'UNVERIFIED',kind:'hard'},
  {key:'billing_preflight',passed:preflight,state:bOk?(b.state||'UNVERIFIED'):'UNVERIFIED',kind:'hard'},
  {key:'live_payment',passed:live,state:live?'VERIFIED':'PENDING',kind:'acceptance'},
  {key:'active_entitlement',passed:entitlement,state:entitlement?'VERIFIED':'PENDING',kind:'acceptance'}
 ];
 const hard=gates.filter(g=>g.kind==='hard'&&!g.passed).map(g=>g.key);
 const pending=gates.filter(g=>g.kind==='acceptance'&&!g.passed).map(g=>g.key);
 const external=['provider_rate_limit'];
 const state=hard.length?'BUILD_HOLD':pending.length?'BUILD_READY_ACCEPTANCE_PENDING':'BUILD_READY_EXTERNAL_VERIFICATION_PENDING';
 return {ok:true,version:'public-final-readiness-v4-v262-source-safe',generated_at:new Date(now).toISOString(),state,
  database_incident:{active:db.active,code:db.code,verified:db.verified},gates,hard_blockers:hard,
  acceptance_pending:pending,external_unknowns:external,
  routing:{canonical_ready:xOk&&x.routing?.canonical_ready===true,direct_edge_ready:xOk&&x.routing?.direct_edge_ready===true,
   direct_edge:xOk?(x.routing?.direct_edge??null):null},
  auth:{state:aOk?(a.state??null):null,password_ready:aOk&&a.auth_settings?.email_password===true,
   google_provider:aOk&&a.auth_settings?.google_provider===true},
  runtime:{certification:rOk?(r.certification_state??null):null,provider_rate_limit_status:'UNVERIFIED_EXTERNALLY'},
  commercial:{ready:preflight,acceptance_state:bOk?(b.state??null):null,live_transaction_verified:live,
   live_flow_verified:live,active_entitlement_verified:entitlement,source:'public-billing-acceptance'},
  source_evidence:sourceEvidence(records,now),
  governance:{action_permitted:'WAIT',capital_permission:'0R',live_order_submission_enabled:false,
   creates_charges:false,grants_entitlement:false},
  truth:{active_deployment_not_equal_browser_acceptance:true,provider_rate_limit_not_independently_verified:true,
   provider_unknown_is_not_treated_as_an_internal_runtime_failure:true,
   canonical_routing_and_live_payment_remain_separate_acceptance_gates:true,
   historical_payment_does_not_prove_current_entitlement:true,missing_or_stale_sources_cannot_clear_incidents:true},
  next:hard.length?'Resolve the reported hard blockers before launch.':pending.length
   ?'Complete authenticated browser acceptance and current payment/entitlement verification.'
   :'Internal acceptance evidence is present; provider verification and independent browser acceptance remain required.'};
}
