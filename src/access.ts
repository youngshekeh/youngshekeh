      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';

      async function load() {
        const state = document.getElementById('state');
        const detail = document.getElementById('detail');
        try {
          const response = await fetch(
            `${SUPABASE}/functions/v1/public-auth-runtime-check`,
            {
              headers: { apikey: KEY, Accept: 'application/json' },
            }
          );
          const data = await response.json();
          const ok = response.ok && data?.ok === true && data?.state === 'PASSWORD_AUTH_READY' && data?.auth_health?.ok === true && data?.auth_settings?.email_password === true;
          state.textContent = ok ? 'READY' : 'CHECK';
          state.className = `value ${ok ? 'good' : 'wait'}`;
          detail.textContent = `Auth ${data?.state || 'UNKNOWN'} · provider rate limit ${data?.provider_rate_limit?.status || 'UNVERIFIED_EXTERNALLY'}`;
        } catch {
          state.textContent = 'CHECK REQUIRED';
          state.className = 'value bad';
          detail.textContent =
            'Runtime telemetry is unavailable. Member password sign-in can still be attempted.';
        }
      }

      load();
