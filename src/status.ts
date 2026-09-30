      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

      async function read(path) {
        const response = await fetch(`${SUPABASE}/functions/v1/${path}`, {
          headers: { apikey: KEY, Accept: 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        return { response, data };
      }

      async function load() {
        try {
          const [authResult, readyResult] = await Promise.all([
            read('public-auth-runtime-check'),
            read('public-final-readiness'),
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
          const provider =
            readyResult.data?.runtime?.provider_rate_limit_status ||
            authResult.data?.provider_rate_limit?.status ||
            'UNVERIFIED_EXTERNALLY';
          document.getElementById('detail').textContent =
            `Provider rate limit ${provider} · browser acceptance remains a separate gate.`;
        } catch {
          document.getElementById('auth').textContent = 'CHECK';
          document.getElementById('ready').textContent = 'CHECK';
          document.getElementById('detail').textContent =
            'Runtime telemetry is temporarily unavailable.';
        }
      }

      load();
