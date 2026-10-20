// A fail-closed, testable assessment for the public launch status surface.
// HTTP 200 is a transport fact, not proof of product acceptance.
export function evaluateLaunchReadiness({ auth, readiness, billing, qa } = {}) {
  const authReady = auth?.response?.ok === true &&
    auth?.data?.state === 'PASSWORD_AUTH_READY' &&
    auth?.data?.auth_health?.ok === true &&
    auth?.data?.auth_settings?.email_password === true;

  const r = readiness?.data ?? {};
  const noBlockers = Array.isArray(r.hard_blockers) && r.hard_blockers.length === 0 &&
    Array.isArray(r.acceptance_pending) && r.acceptance_pending.length === 0 &&
    Array.isArray(r.external_unknowns) && r.external_unknowns.length === 0;
  const finalReady = readiness?.response?.ok === true &&
    r.ok === true && r.state === 'FULL_ACCEPTANCE_READY' &&
    r.database_incident?.active === false && noBlockers;

  const qaReady = qa?.response?.ok === true &&
    qa?.data?.ok === true &&
    Number.isInteger(qa?.data?.summary?.total) &&
    qa.data.summary.total > 0 &&
    Number.isInteger(qa?.data?.summary?.failed) &&
    qa.data.summary.failed === 0 &&
    Number.isInteger(qa?.data?.summary?.passed) &&
    qa.data.summary.passed === qa.data.summary.total;

  const identityReady = qa?.response?.ok === true &&
    qa?.response?.headers?.get?.('x-tfa-auth') === 'VERCEL_OIDC';

  const billingReady = billing?.response?.ok === true &&
    billing?.data?.ok === true &&
    billing?.data?.ready_for_checkout === true &&
    billing?.data?.live_flow_verified === true;

  const checks = {
    auth: authReady,
    final_acceptance: finalReady,
    private_qa: qaReady,
    workload_identity: identityReady,
    billing: billingReady,
  };
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    state: blockers.length === 0 ? 'LAUNCH READY' : 'LAUNCH HOLD',
    ready: blockers.length === 0,
    checks: Object.freeze(checks),
    blockers: Object.freeze(blockers),
  });
}
