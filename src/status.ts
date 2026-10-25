import './status-editorial.css';
import {probePublicStatus} from './status-public-lane.mjs';
import { evaluateLaunchReadiness, freshEvidence } from './launch-readiness.mjs';
import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';
import {assessQaAdmission} from './qa-admission.mjs';
import {probeStatusDependencies} from './status-dependency-admission.mjs';
import {inspectResearchSources} from './status-market-lane.mjs';
import {buildSupabaseSupportPacket} from './v259-support-escalation.mjs';
import {readPublicAcceptance} from './public-acceptance-connection.mjs';
import {describeQaObservation} from './v287-qa-observation.mjs';

const timeoutMs = 7_000;
const missing = () => ({ response: { ok: false, headers: { get: () => null } }, data: { ok: false, state: 'UNAVAILABLE' } });

async function readEdge(path) {
  return readPublicAcceptance(path);
}

async function readSite(path) {
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({ ok: false, state: 'INVALID_RESPONSE' }));
  return { response, data };
}

function show(id, value, passed) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = String(value ?? 'UNAVAILABLE');
  el.className = 'value ' + (passed ? 'good' : 'wait');
}

function completed(item) {
  return item?.status === 'fulfilled' ? item.value : missing();
}

let inFlight = false;
async function load() {
  if (inFlight) return;
  inFlight = true;
  const refresh = document.getElementById('status-refresh');
  if (refresh) refresh.disabled = true;
  try {
    // One failed endpoint must never erase the results of independent probes.
    // Read the cheap central release incident verdict first, alongside Gold.
    // A current DB incident makes additional auth and billing probes redundant.
    // Market reference availability is handled separately by loadPublic().
    const results = await Promise.allSettled([
      readEdge('public-final-readiness'),
      readSite('/api/public-gold-read'),
    ]);
    const [readiness, gold] = results.map(completed);
    const privateProbe = await probeStatusDependencies({
      readiness,
      readAuth:()=>readEdge('public-auth-runtime-check'),
      readBilling:()=>readEdge('public-billing-acceptance'),
    });
    const {auth, billing} = privateProbe;
    // Do not amplify a known database incident with 107 independent private
    // QA probes. Defer the expensive OIDC relay until cheap launch inputs pass.
    // A deferred matrix is unverified, never a green QA or identity verdict.
    const qaAdmission = assessQaAdmission({auth, readiness, billing, gold});
    const qa = qaAdmission.admitted
      ? await readSite('/api/autonomous-qa-matrix?status_surface=1').catch(missing)
      : missing();
    const gate = evaluateLaunchReadiness({ auth, readiness, billing, qa, gold });
    show('auth', auth.data?.state || 'UNAVAILABLE', gate.checks.auth);
    show('ready', readiness.data?.state || 'UNAVAILABLE', gate.checks.final_acceptance);
    const summary = qa.data?.summary;
    const qaTruth = describeQaObservation({admitted:qaAdmission.admitted,result:qa});
    show('brain', gate.checks.private_qa
      ? 'PASS ' + summary.passed + '/' + summary.total
      : qaTruth.label, gate.checks.private_qa);
    show('identity', gate.checks.workload_identity
      ? 'VERCEL OIDC · VERIFIED' : (qaAdmission.admitted ? 'UNVERIFIED' : 'DEFERRED · NOT CERTIFIED'), gate.checks.workload_identity);
    show('billing', billing.data?.state || 'UNAVAILABLE', gate.checks.billing);
    const kernel = qa.data?.continuous_kernel ?? qa.data?.runtime?.continuous_kernel ?? null;
    const certifiedCycles = Number.isInteger(kernel?.consecutive_successes) ? kernel.consecutive_successes : 0;
    const kernelObserved = kernel?.ok === true
      && certifiedCycles > 0
      && kernel?.capital_permission === '0R'
      && kernel?.action_permitted === 'WAIT'
      && freshEvidence(kernel?.last_succeeded_at);
    show('kernel', gate.checks.continuous_kernel
      ? '2+ CERTIFIED CYCLES'
      : kernelObserved ? 'PROCESSING OBSERVED · NOT LAUNCH-CERTIFIED' : 'NOT VERIFIED',
      gate.checks.continuous_kernel);
    // Distinguish a genuine merchant preflight from verified paid entitlement.
    // A historical signed transaction is not current membership activation.
    const partialBilling = !gate.checks.billing
      && billing.data?.ok === true
      && freshEvidence(billing.data?.generated_at)
      && billing.data?.gates?.provider_plan_parity === 'PASS'
      && billing.data?.gates?.signed_payment_evidence === 'PASS';
    if(partialBilling)show('billing', 'PROVIDER PREFLIGHT · ENTITLEMENT PENDING', false);
    const goldProof = verifyPublicGoldQuote(gold);
    show('gold', goldProof.verified
      ? 'BROKER LIVE · ' + goldProof.observed_at + ' UTC VERIFIED'
      : 'NOT LIVE-VERIFIED · ' + goldProof.reason, goldProof.verified);
    show('launch-gate', gate.state, gate.ready);
    const provider = readiness.data?.runtime?.provider_rate_limit_status
      || auth.data?.provider_rate_limit?.status || 'UNVERIFIED_EXTERNALLY';
    const blockers = gate.blockers.length ? gate.blockers.join(', ') : 'NONE';
    const remoteBlockers = Array.isArray(readiness.data?.hard_blockers)
      ? readiness.data.hard_blockers.slice(0, 8).join(', ') : 'UNKNOWN';
    const detail = document.getElementById('detail');
    if (detail) detail.textContent =
      'Launch blockers: ' + blockers +
      ' · Backend hard blockers: ' + remoteBlockers +
      ' · Provider verification: ' + provider +
      ' · Incident-aware probe admission: ' + privateProbe.admission.reason +
      ' · Private auth/billing probes: ' + privateProbe.requests_sent + ' of 2' +
      ' · Private QA: ' + (qaAdmission.admitted ? 'REQUESTED AFTER PRECHECK PASS' : 'DEFERRED WITHOUT MAKING A PRIVATE QA REQUEST') +
      ' · QA evidence class: ' + qaTruth.kind +
      ' · Public Gold: ' + (gate.checks.public_gold_data ? 'FRESH BROKER TICK' : 'FRESH BROKER TICK NOT VERIFIED') +
      ' · V180 kernel: ' + (gate.checks.continuous_kernel ? 'RECENT SUCCESS' : 'NO VERIFIED RECEIPT') +
      ' · Trading permission: WAIT / 0R. No live orders authorized.';
    const at = document.getElementById('last-checked');
    if (at) at.textContent = 'Checked ' + new Date().toLocaleString() + ' · Independent probes · fail closed';
  } catch {
    // The independently fetched public lane owns its own status during private failures.
    for (const id of ['auth', 'ready', 'brain', 'identity', 'billing', 'kernel', 'gold', 'launch-gate']) {
      show(id, id === 'launch-gate' ? 'LAUNCH HOLD' : 'UNAVAILABLE', false);
    }
    const detail = document.getElementById('detail');
    if (detail) detail.textContent = 'Status check unavailable. Launch remains on hold. Capital permission WAIT / 0R.';
  } finally {
    inFlight = false;
    if (refresh) refresh.disabled = false;
  }
}

// The user can see verified public research availability immediately, without
// waiting for private database prechecks to finish or time out.
async function loadPublic(){
 return probePublicStatus({
  readReference:()=>readSite('/api/public-market-reference'),
  report(publicSurface){
   show('public-page',publicSurface.page_state,publicSurface.page_delivered);
   show('public-reference',publicSurface.reference_state,publicSurface.research_reference_available);
   const proof=document.getElementById('public-proof');
   if(proof)proof.textContent=
    'Gold source current: '+(publicSurface.gold_reference_current?'YES':'NO')+
    ' · Bitcoin receipt current: '+(publicSurface.bitcoin_reference_current?'YES':'NO')+
    ' · Read-only references, not broker bid/ask, trading permission or paid entitlement.';
  }
 });
}
let marketExtrasInFlight=false;
function displayResearchHealth(kind,report){
 const id=kind==='macro'?'public-macro':'public-quarterly';
 show(id,report.state,report.full);
 const el=document.getElementById(id+'-proof');
 if(el)el.textContent=report.source+' · '+report.detail+
  (report.observed_at?' · Oldest verified market observation: '+new Date(report.observed_at).toLocaleString():'')+
  ' · WAIT / 0R · No broker certification.';
}
async function loadMarketExtras(){
 if(marketExtrasInFlight)return;
 marketExtrasInFlight=true;
 try{
  await inspectResearchSources({
   read:async kind=>readSite(kind==='macro'?'/api/public-macro-reference':'/api/public-quarterly-zones'),
   report:displayResearchHealth
  });
 }finally{marketExtrasInFlight=false}
}
document.getElementById('status-refresh')?.addEventListener('click',()=>{
 void loadPublic();
 void loadMarketExtras();
 void load();
});

let authGatewayInFlight=false;
async function inspectExternalAuthGateway(){
  if(authGatewayInFlight)return;
  authGatewayInFlight=true;
  const button=document.getElementById('auth-gateway-check');
  if(button)button.disabled=true;
  show('auth-gateway','CHECKING EXTERNAL AUTH PATH',false);
  const detail=document.getElementById('auth-gateway-detail');
  try{
    const result=await readSite('/api/public-auth-gateway');
    const data=result.data||{};
    const current=result.response?.ok===true && data.ok===true
      && freshEvidence(data.generated_at);
    const state=current&&typeof data.state==='string'?data.state:'CHECK UNAVAILABLE';
    // External path reachability never changes the private Auth or launch gate.
    show('auth-gateway',state+' · NOT SIGN-IN CERTIFIED',false);
    if(detail)detail.textContent='Supabase Auth health: '+(current?data.checks?.health?.status||0:'UNVERIFIED')
      +' · Settings: '+(current?data.checks?.settings?.status||0:'UNVERIFIED')
      +' · Diagnostic vantage: Vercel external request. This is not browser login, checkout, database recovery or broker proof.';
  }catch{
    show('auth-gateway','CHECK UNAVAILABLE',false);
    if(detail)detail.textContent='External Auth network check failed. Private login and commercial launch remain unverified.';
  }finally{
    authGatewayInFlight=false;
    if(button)button.disabled=false;
  }
}
document.getElementById('auth-gateway-check')?.addEventListener('click',()=>void inspectExternalAuthGateway());
let latestRecoveryForSupport=null;
let recoveryTriageInFlight=false;
async function inspectRecoveryTriage(){
 if(recoveryTriageInFlight)return;
 recoveryTriageInFlight=true;
 latestRecoveryForSupport=null;
 const supportButton=document.getElementById('support-escalation-prepare');
 if(supportButton)supportButton.disabled=true;
 const report=document.getElementById('support-escalation-report');
 if(report){report.value='';report.hidden=true}
 const feedback=document.getElementById('support-escalation-state');
 if(feedback)feedback.textContent='Checking transport evidence before preparing the report.';
 const button=document.getElementById('recovery-triage-check');
 if(button)button.disabled=true;
 show('recovery-triage','CHECKING · HTTP TRANSPORT ONLY',false);
 const info=document.getElementById('recovery-triage-detail');
 try{
  const result=await readSite('/api/public-recovery-triage');
  const d=result.data||{};
  const verified=result.response?.ok===true&&d.ok===true
   &&freshEvidence(d.generated_at)
   &&d.governance?.capital_permission==='0R'
   &&d.governance?.live_order_submission_enabled===false
   &&d.private_actions_executed===0&&d.database_jobs_modified===0;
  const auth=verified?d.checks?.auth_http?.state:'NOT VERIFIED';
  const rest=verified?d.checks?.postgrest_http?.state:'NOT VERIFIED';
  const incident=verified&&d.checks?.database_incident_reported===true;
  const supportPacket=verified?buildSupabaseSupportPacket(d):null;
  latestRecoveryForSupport=supportPacket?d:null;
  if(supportButton)supportButton.disabled=!supportPacket;
  if(feedback)feedback.textContent=supportPacket
   ?'Source-verified report can now be prepared. Nothing has been submitted.'
   :'Report unavailable without fresh verified diagnostic evidence.';
  show('recovery-triage',incident?'DATABASE INCIDENT REPORTED · LAUNCH HOLD':
   verified?'TRANSPORT CHECKED · LAUNCH STILL ON HOLD':'DIAGNOSTIC UNAVAILABLE · LAUNCH HOLD',false);
  if(info)info.textContent='Auth HTTP: '+auth+' · PostgREST HTTP: '+rest+
   ' · Database incident: '+(incident?'REPORTED':'NOT VERIFIED OR NOT REPORTED')+
   ' · This does not certify a SQL query, login, a kernel receipt, billing, a broker price, or readiness. WAIT / 0R.';
 }catch{
  latestRecoveryForSupport=null;
  if(supportButton)supportButton.disabled=true;
  if(feedback)feedback.textContent='No report available: diagnostic evidence unavailable.';
  show('recovery-triage','DIAGNOSTIC UNAVAILABLE · LAUNCH HOLD',false);
  if(info)info.textContent='On-demand network check failed; no private execution or scheduler changes attempted.';
 }finally{
  recoveryTriageInFlight=false;
  if(button)button.disabled=false;
 }
}
document.getElementById('recovery-triage-check')?.addEventListener('click',()=>void inspectRecoveryTriage());
document.getElementById('support-escalation-prepare')?.addEventListener('click',async()=>{
 const output=document.getElementById('support-escalation-report');
 const note=document.getElementById('support-escalation-state');
 const packet=buildSupabaseSupportPacket(latestRecoveryForSupport);
 if(!packet){
  if(note)note.textContent='Snapshot expired or invalid. Run the read-only diagnostic again.';
  if(output){output.hidden=true;output.value=''}
  return;
 }
 if(output){output.value=packet.message;output.hidden=false}
 let copied=false;
 try{
  if(navigator.clipboard?.writeText){
   await navigator.clipboard.writeText(packet.message);
   copied=true;
  }
 }catch{}
 if(note)note.textContent=copied
  ?'Report copied. Paste it into a support request; NO TICKET HAS BEEN SUBMITTED.'
  :'Report prepared below. Select and copy it into Supabase Support; NO TICKET HAS BEEN SUBMITTED.';
 if(!copied)output?.focus();
});

void loadMarketExtras();
void loadPublic();
void load();
