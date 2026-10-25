// V312: pure, fail-closed observation primitives. No order, payment or DB writes.
export const GOVERNANCE = Object.freeze({
  mode: 'READ_ONLY_SHADOW',
  capital_permission: '0R',
  live_order_submission_enabled: false,
  automatic_execution: false,
  commercial_launch_approved: false
});

export function validateSource(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' ||
      url.hostname !== 'thefatheranalytics.com' ||
      url.pathname !== '/api/public-recovery-triage' ||
      url.search || url.hash || url.username || url.password || url.port) {
    throw new Error('source_must_be_fixed_read_only_public_triage');
  }
  return url.toString();
}

export function assessProbe({ status, body, checkedAt }) {
  const object = body && typeof body === 'object' && !Array.isArray(body);
  const transportOk = Number.isInteger(status) && status >= 200 && status < 300;
  const observationOk = Boolean(transportOk && object);
  const reportedState = object && typeof body.state === 'string'
    ? body.state.slice(0, 80) : null;
  return {
    checked_at: checkedAt,
    http_status: Number.isInteger(status) ? status : 0,
    observation_ok: observationOk,
    provider_reported_state: reportedState,
    market_data_freshness_verified: false,
    autonomous_cycles_verified: false,
    database_recovery_verified: false,
    machine_operational_verified: false,
    governance: GOVERNANCE
  };
}
