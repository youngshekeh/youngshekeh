import { evaluateLaunchReadiness, freshEvidence } from './launch-readiness.mjs';
import {verifyPublicGoldQuote} from './public-gold-evidence.mjs';
import {assessQaAdmission} from './qa-admission.mjs';

const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

const timeoutMs = 7_000;
const missing = () => ({ response: { ok: false, headers: { get: () => null } }, data: { ok: false, state: 'UNAVAILABLE' } });

async function readEdge(path) {
  const response = await fetch(SUPABASE + '/functions/v1/' + path, {
    headers: { apikey: KEY, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => ({ ok: false, state: 'INVALID_RESPONSE' }));
  return { response, data };
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
    const results = await Promise.allSettled([
      readEdge('public-auth-runtime-check'),
      readEdge('public-final-readiness'),
      readEdge('public-billing-acceptance'),
      readSite('/api/market-feed?feed=public-gold-live-xauusd'),
    ]);
    const [auth, readiness, billing, gold] = results.map(completed);
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
    show('brain', gate.checks.private_qa
      ? 'PASS ' + summary.passed + '/' + summary.total
      : (qaAdmission.admitted ? (qa.data?.state || 'UNVERIFIED') : 'DEFERRED · PREREQUISITES UNHEALTHY'), gate.checks.private_qa);
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
      ' · Private QA: ' + (qaAdmission.admitted ? 'REQUESTED AFTER PRECHECK PASS' : 'DEFERRED WITHOUT MAKING A PRIVATE QA REQUEST') +
      ' · Public Gold: ' + (gate.checks.public_gold_data ? 'FRESH BROKER TICK' : 'FRESH BROKER TICK NOT VERIFIED') +
      ' · V180 kernel: ' + (gate.checks.continuous_kernel ? 'RECENT SUCCESS' : 'NO VERIFIED RECEIPT') +
      ' · Trading permission: WAIT / 0R. No live orders authorized.';
    const at = document.getElementById('last-checked');
    if (at) at.textContent = 'Checked ' + new Date().toLocaleString() + ' · Independent probes · fail closed';
  } catch {
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

document.getElementById('status-refresh')?.addEventListener('click', () => { void load(); });
void load();
