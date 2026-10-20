// Fail-closed public launch assessment. HTTP success is not product certification.
// The source date must be recent; fresh browser probes without server timestamps
// are acceptable only for the read-only QA lane, not a historical kernel receipt.
export const MAX_EVIDENCE_AGE_MS = 10 * 60 * 1000;
export function freshEvidence(value, now = Date.now()) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) && timestamp <= now + 60000
    && now - timestamp <= MAX_EVIDENCE_AGE_MS;
}
export function evaluateLaunchReadiness({ auth, readiness, billing, qa } = {}, now = Date.now()) {
  const a = auth?.data ?? {};
  const r = readiness?.data ?? {};
  const b = billing?.data ?? {};
  const q = qa?.data ?? {};

  const authReady = auth?.response?.ok === true && a.ok === true
    && freshEvidence(a.generated_at, now)
    && a.state === 'PASSWORD_AUTH_READY'
    && a.auth_health?.ok === true && a.auth_settings?.email_password === true;

  const noBlockers = Array.isArray(r.hard_blockers) && r.hard_blockers.length === 0
    && Array.isArray(r.acceptance_pending) && r.acceptance_pending.length === 0
    && Array.isArray(r.external_unknowns) && r.external_unknowns.length === 0;
  const finalReady = readiness?.response?.ok === true && r.ok === true
    && freshEvidence(r.generated_at, now)
    && r.state === 'FULL_ACCEPTANCE_READY'
    && r.database_incident?.active === false && noBlockers;

  // QA is requested with no-store and an authenticated Vercel OIDC relay.
  // Its current response is evaluated, not a cached historical result.
  const qaReady = qa?.response?.ok === true && q.ok === true
    && Number.isInteger(q.summary?.total) && q.summary.total > 0
    && Number.isInteger(q.summary?.failed) && q.summary.failed === 0
    && Number.isInteger(q.summary?.passed) && q.summary.passed === q.summary.total;
  const identityReady = qaReady
    && qa?.response?.headers?.get?.('x-tfa-auth') === 'VERCEL_OIDC';

  // Historical signed payments and provider plan matching do not prove the
  // current subscription ledger has granted access. Entitlement evidence must
  // be explicitly positive before any public launch-ready assessment.
  const billingReady = billing?.response?.ok === true && b.ok === true
    && freshEvidence(b.generated_at, now)
    && b.ready_for_checkout === true && b.live_flow_verified === true
    && b.state === 'LIVE_FLOW_VERIFIED'
    && b.gates?.provider_plan_parity === 'PASS'
    && b.gates?.signed_payment_evidence === 'PASS'
    && b.gates?.active_entitlement_evidence === 'PASS';

  // A passing QA matrix is not sufficient evidence that the V180 continuous
  // kernel is running. Require its own recent authenticated success receipt.
  const kernel = q.continuous_kernel ?? q.runtime?.continuous_kernel ?? null;
  // The private runtime may return one healthy receipt while subsequent
  // cycles fail. Require the explicitly independently counted consecutive
  // successful executions already demanded by checkout verification.
  const kernelReady = qaReady && identityReady
    && kernel?.ok === true
    && freshEvidence(kernel?.last_succeeded_at, now)
    && Number.isInteger(kernel?.consecutive_successes)
    && kernel.consecutive_successes >= 2
    && kernel?.capital_permission === '0R'
    && kernel?.action_permitted === 'WAIT';

  const checks = {
    auth: authReady,
    final_acceptance: finalReady,
    private_qa: qaReady,
    workload_identity: identityReady,
    billing: billingReady,
    continuous_kernel: kernelReady,
  };
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    state: blockers.length === 0 ? 'LAUNCH READY' : 'LAUNCH HOLD',
    ready: blockers.length === 0,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
    evidence_max_age_ms: MAX_EVIDENCE_AGE_MS,
  });
}
