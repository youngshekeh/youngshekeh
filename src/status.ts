      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

      async function read(path) {
        const response = await fetch(`${SUPABASE}/functions/v1/${path}`, {
          headers: { apikey: KEY, Accept: 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      }

      async function readSite(path) {
        const response = await fetch(path, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      }

      async function load() {
        try {
          const [authResult, readyResult, billingResult, qaResult] =
            await Promise.all([
              read('public-auth-runtime-check'),
              read('public-final-readiness'),
              read('public-billing-acceptance'),
              readSite('/api/autonomous-qa-matrix?status_surface=1'),
            ]);
          const authOk =
            authResult.response.ok && authResult.data?.ok !== false;
          document.getElementById('auth').textContent =
            authResult.data?.state || (authOk ? 'READY' : 'CHECK');
          document.getElementById('auth').className =
            `value ${authOk ? 'good' : 'wait'}`;
          document.getElementById('ready').textContent =
            readyResult.data?.state || 'CHECK';
          document.getElementById('ready').className =
            `value ${readyResult.response.ok ? 'good' : 'wait'}`;

          const brainOk =
            qaResult.response.ok &&
            qaResult.data?.ok === true &&
            Number(qaResult.data?.summary?.failed ?? 1) === 0;
          document.getElementById('brain').textContent =
            brainOk
              ? `PASS ${qaResult.data?.summary?.passed ?? 0}/${qaResult.data?.summary?.total ?? 0}`
              : qaResult.data?.state || 'CHECK';
          document.getElementById('brain').className =
            `value ${brainOk ? 'good' : 'wait'}`;

          const workloadIdentity =
            qaResult.response.headers.get('x-tfa-auth') || 'UNVERIFIED';
          const identityOk = workloadIdentity === 'VERCEL_OIDC';
          document.getElementById('identity').textContent =
            identityOk ? 'VERCEL OIDC · VERIFIED' : workloadIdentity;
          document.getElementById('identity').className =
            `value ${identityOk ? 'good' : 'wait'}`;

          const billingOk =
            billingResult.response.ok &&
            billingResult.data?.ready_for_checkout === true &&
            billingResult.data?.live_flow_verified === true;
          document.getElementById('billing').textContent =
            billingResult.data?.state || (billingOk ? 'LIVE FLOW VERIFIED' : 'CHECK');
          document.getElementById('billing').className =
            `value ${billingOk ? 'good' : 'wait'}`;

          const provider =
            readyResult.data?.runtime?.provider_rate_limit_status ||
            authResult.data?.provider_rate_limit?.status ||
            'UNVERIFIED_EXTERNALLY';
          const failed = Number(qaResult.data?.summary?.failed ?? 0);
          document.getElementById('detail').textContent =
            `Private Brain ${brainOk ? 'healthy' : 'check'} · workload identity ${workloadIdentity} · QA failures ${failed} · billing ${billingResult.data?.state || 'CHECK'} · provider rate limit ${provider} · capital authority remains WAIT / 0R.`;
        } catch {
          document.getElementById('auth').textContent = 'CHECK';
          document.getElementById('ready').textContent = 'CHECK';
          document.getElementById('brain').textContent = 'CHECK';
          document.getElementById('identity').textContent = 'CHECK';
          document.getElementById('billing').textContent = 'CHECK';
          document.getElementById('detail').textContent =
            'Runtime telemetry is temporarily unavailable.';
        }
      }

      load();
