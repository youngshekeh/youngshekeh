const PATHS = {
  quota: '/api/quota-probe',
  edge: '/api/provider-edge-acceptance',
  state: '/api/autonomous-state',
  qa: '/api/autonomous-qa-matrix',
  release: '/api/release-attestation'
};

async function probe(origin, name, path, timeout = 18000) {
  const started = Date.now();
  try {
    const response = await fetch(new URL(path, origin), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'THE-FATHER-ANALYTICS-V142-RECOVERY/1.0'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout)
    });
    const body = await response.json().catch(() => null);
    return {
      name,
      ok: response.ok,
      status: response.status,
      latency_ms: Date.now() - started,
      body
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 0,
      latency_ms: Date.now() - started,
      error: String(error).slice(0, 180),
      body: null
    };
  }
}

function bool(value) {
  return value === true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const host = String(req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL || '').trim();
  if (!host) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, error: 'deployment_origin_unavailable' });
  }
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const origin = new URL(`${proto}://${host}`);

  const [quota, edge, state, qa, release] = await Promise.all([
    probe(origin, 'quota', PATHS.quota, 12000),
    probe(origin, 'edge', PATHS.edge, 16000),
    probe(origin, 'state', PATHS.state, 22000),
    probe(origin, 'qa', PATHS.qa, 32000),
    probe(origin, 'release', PATHS.release, 12000)
  ]);

  const q = quota.body || {};
  const e = edge.body || {};
  const s = state.body || {};
  const qam = qa.body || {};
  const r = release.body || {};
  const canonicalBlockers = Array.isArray(s?.blockers) ? s.blockers.map(String) : [];

  const quotaClear =
    quota.ok &&
    bool(q?.ok) &&
    q?.restricted === false &&
    Number(q?.upstream_status) === 200 &&
    bool(q?.canonical_upstream_ok);

  const edgeVerified =
    edge.ok &&
    bool(e?.ok) &&
    e?.state === 'EXTERNAL_EDGE_PATH_VERIFIED' &&
    Number(e?.summary?.rate_limited || 0) === 0 &&
    Number(e?.summary?.server_errors || 0) === 0;

  const canonicalEdgeRestricted =
    s?.health?.edge_runtime === 'RESTRICTED_QUOTA' ||
    canonicalBlockers.includes('EDGE_QUOTA_RESTRICTED');

  const smokeFresh = s?.health?.production_smoke?.state === 'FRESH';
  const qaPass = qa.ok && bool(qam?.ok) && qam?.state === 'PASS' && Number(qam?.summary?.failed || 0) === 0;
  const releaseVerified =
    release.ok &&
    bool(r?.ok) &&
    r?.state === 'PRODUCTION_SOURCE_VERIFIED' &&
    r?.environment === 'production' &&
    r?.git_branch === 'the-father-analytics-deploy';

  const providerRecoveryEvidence = quotaClear && edgeVerified;
  const staleCanonicalRestriction = providerRecoveryEvidence && canonicalEdgeRestricted;

  let recoveryState = 'RECOVERY_BLOCKED';
  if (providerRecoveryEvidence && canonicalEdgeRestricted) {
    recoveryState = 'PROVIDER_RECOVERED_CANONICAL_RECONCILIATION_PENDING';
  } else if (providerRecoveryEvidence && !canonicalEdgeRestricted && !smokeFresh) {
    recoveryState = 'CANONICAL_RECOVERED_SMOKE_RECERTIFICATION_PENDING';
  } else if (providerRecoveryEvidence && !canonicalEdgeRestricted && smokeFresh && qaPass && releaseVerified) {
    recoveryState = 'RECOVERY_VERIFIED';
  } else if (providerRecoveryEvidence && !canonicalEdgeRestricted) {
    recoveryState = 'RECOVERY_PARTIAL_QA_OR_RELEASE_PENDING';
  }

  const actions = [];
  if (!quotaClear) actions.push('WAIT_FOR_QUOTA_PROBE_CLEAR');
  if (!edgeVerified) actions.push('WAIT_FOR_EXTERNAL_EDGE_ACCEPTANCE');
  if (staleCanonicalRestriction) actions.push('RECONCILE_V70_QUOTA_PROBE');
  if (!canonicalEdgeRestricted && !smokeFresh) actions.push('RESTORE_GUARDED_SMOKE_AND_RECERTIFY');
  if (!qaPass) actions.push('RERUN_QA_AND_INSPECT_FAILED_TESTS');
  if (!releaseVerified) actions.push('VERIFY_PRODUCTION_RELEASE_PROVENANCE');

  const observedChecks = [quotaClear, edgeVerified, !canonicalEdgeRestricted, smokeFresh, qaPass, releaseVerified];
  const recoveryScore = Math.round((observedChecks.filter(Boolean).length / observedChecks.length) * 100);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-TFA-Recovery', 'V142');
  return res.status(200).json({
    ok: true,
    version: 'v142-runtime-recovery-engine-v1',
    checked_at: new Date().toISOString(),
    state: recoveryState,
    recovery_score: recoveryScore,
    evidence: {
      live_quota_probe: {
        clear: quotaClear,
        status: quota.status,
        latency_ms: quota.latency_ms,
        upstream_status: q?.upstream_status ?? null,
        restricted: q?.restricted ?? null
      },
      external_edge_acceptance: {
        verified: edgeVerified,
        status: edge.status,
        latency_ms: edge.latency_ms,
        rate_limited: e?.summary?.rate_limited ?? null,
        server_errors: e?.summary?.server_errors ?? null,
        transport_passed: e?.summary?.transport_passed ?? null,
        total: e?.summary?.total ?? null
      },
      canonical_state: {
        ok: bool(s?.ok),
        mode: s?.mode ?? null,
        edge_runtime: s?.health?.edge_runtime ?? null,
        smoke_state: s?.health?.production_smoke?.state ?? null,
        smoke_age_minutes: s?.health?.production_smoke?.age_minutes ?? null,
        blockers: canonicalBlockers
      },
      qa: {
        pass: qaPass,
        state: qam?.state ?? null,
        passed: qam?.summary?.passed ?? null,
        failed: qam?.summary?.failed ?? null,
        total: qam?.summary?.total ?? null
      },
      release: {
        verified: releaseVerified,
        state: r?.state ?? null,
        commit: r?.git_commit_short ?? null,
        branch: r?.git_branch ?? null
      }
    },
    divergence: {
      provider_recovery_evidence: providerRecoveryEvidence,
      canonical_edge_restriction_stale: staleCanonicalRestriction
    },
    actions,
    governance: {
      action_permitted: 'WAIT',
      capital_permission: '0R',
      live_order_routing: false,
      automatic_policy_promotion: false,
      recovery_evidence_can_unlock_capital: false
    },
    truth_label: 'LIVE_RECOVERY_DIAGNOSTIC_NOT_EXECUTION_PERMISSION'
  });
}
