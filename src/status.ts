// V183 public launch truth gate. No secrets, no private kernel invocation, no order routes.
const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
const MAX_AGE_MS = 10 * 60 * 1000;
const PROBE_TIMEOUT_MS = 7000;

function byId(id) {
  return document.getElementById(id);
}
function setGate(id, label, passed) {
  const element = byId(id);
  if (!element) return;
  element.textContent = label;
  element.className = 'value ' + (passed ? 'good' : 'wait');
}
function freshTime(value) {
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(t) && t <= Date.now() + 60000 && Date.now() - t <= MAX_AGE_MS;
}
async function probe(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok && data?.ok === true, response, data };
  } catch {
    return { ok: false, response: null, data: null };
  }
}
function render(ready, qa) {
  const r = ready.data || {};
  const q = qa.data || {};
  const finalFresh = ready.ok && freshTime(r.generated_at);
  const qaFresh = qa.ok && freshTime(q.generated_at);
  const finalAccepted = finalFresh && r.state === 'FULL_ACCEPTANCE_READY'
    && Array.isArray(r.hard_blockers) && r.hard_blockers.length === 0
    && Array.isArray(r.acceptance_pending) && r.acceptance_pending.length === 0
    && Array.isArray(r.external_unknowns) && r.external_unknowns.length === 0;
  const authOk = finalFresh && r.auth?.password_ready === true;
  const paymentOk = finalFresh && r.commercial?.ready === true
    && r.commercial?.live_transaction_verified === true;
  const count = Number(q.summary?.total);
  const failed = Number(q.summary?.failed);
  const qaHealthy = qaFresh && Number.isFinite(count) && count > 0
    && failed === 0 && Number(q.summary?.passed) === count;
  const identityOk = qaHealthy && qa.response?.headers.get('x-tfa-auth') === 'VERCEL_OIDC';
  // Only a positive, recent, authenticated kernel-success receipt may open this gate.
  // General QA passing is not proof that the continuous kernel is running.
  const kernel = q.continuous_kernel || q.runtime?.continuous_kernel || null;
  const kernelFresh = kernel && freshTime(kernel.last_succeeded_at);
  const kernelOk = kernel?.ok === true && kernelFresh === true
    && kernel.capital_permission === '0R';
  const launchReady = finalAccepted && qaHealthy && identityOk && paymentOk && kernelOk;

  setGate('auth', authOk ? 'PASSWORD AUTH VERIFIED' : 'NOT VERIFIED', authOk);
  setGate('ready', finalAccepted ? 'ACCEPTED' : (finalFresh ? String(r.state || 'HOLD') : 'STALE / UNAVAILABLE'), finalAccepted);
  setGate('brain', qaHealthy ? ('PASS ' + count + '/' + count) : 'NOT VERIFIED', qaHealthy);
  setGate('identity', identityOk ? 'VERCEL OIDC VERIFIED' : 'NOT VERIFIED', identityOk);
  setGate('billing', paymentOk ? 'LIVE FLOW VERIFIED' : 'PENDING / UNVERIFIED', paymentOk);
  setGate('kernel', kernelOk ? 'RECENT SUCCESS VERIFIED' : 'NOT VERIFIED', kernelOk);
  byId('launch-mode').textContent = launchReady ? 'FULL LAUNCH ACCEPTED' : 'PUBLIC PREVIEW · GATED';
  byId('last-observation').textContent = finalFresh
    ? new Date(r.generated_at).toLocaleString()
    : 'FRESH EVIDENCE UNAVAILABLE';
  byId('detail').textContent = launchReady
    ? 'All independent gates have recent, affirmative evidence. Trading remains WAIT / 0R.'
    : 'Public pages can remain accessible, but full operational launch is not yet certified. Unverified evidence and incomplete acceptance are launch blockers. Trading remains WAIT / 0R.';
  byId('evidence').textContent = 'Readiness: ' + (finalFresh ? r.state : 'STALE/UNAVAILABLE')
    + ' · QA: ' + (qaFresh ? 'OBSERVED' : 'STALE/UNAVAILABLE')
    + ' · Continuous kernel: ' + (kernelOk ? 'RECENT RECEIPT' : 'NO VERIFIED RECEIPT')
    + ' · Payments: ' + (paymentOk ? 'VERIFIED' : 'NOT VERIFIED');
}
async function load() {
  const [ready, qa] = await Promise.all([
    probe(SUPABASE + '/functions/v1/public-final-readiness'),
    probe('/api/autonomous-qa-matrix?status_surface=1'),
  ]);
  render(ready, qa);
}
load().catch(() => {
  byId('launch-mode').textContent = 'PUBLIC PREVIEW · GATED';
  byId('detail').textContent = 'Status evidence could not be verified. No launch approval or capital authorization is implied.';
});
