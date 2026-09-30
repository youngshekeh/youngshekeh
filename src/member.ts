      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const FUNCTIONS = `${SUPABASE}/functions/v1`;
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
      const $ = id => document.getElementById(id);

      function saveSession(data) {
        sessionStorage.setItem(
          'tfa_session',
          JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token || null,
          })
        );
      }

      function clearSession() {
        sessionStorage.removeItem('tfa_session');
        $('session').classList.add('hidden');
        $('result').textContent = 'Session cleared.';
      }

      async function verifySession(token) {
        const response = await fetch(`${FUNCTIONS}/member-session`, {
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data?.error || 'member_session_failed');
        $('session').classList.remove('hidden');
        $('access').textContent = data?.is_owner ? 'OWNER / MEMBER' : 'MEMBER';
        $('sessionDetail').textContent =
          `Access ${String(data?.access_state || 'member').toUpperCase()} · plan ${data?.subscription?.plan_name || 'Free'}`;
        return data;
      }

      async function signIn() {
        const email = $('email').value.trim();
        const password = $('password').value;
        if (!email || !password) {
          $('result').textContent = 'Email and password are required.';
          return;
        }
        $('result').textContent = 'Authenticating...';
        try {
          const response = await fetch(
            `${SUPABASE}/auth/v1/token?grant_type=password`,
            {
              method: 'POST',
              headers: { apikey: KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            }
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(
              data?.msg ||
                data?.message ||
                data?.error_description ||
                'Authentication failed'
            );
          saveSession(data);
          await verifySession(data.access_token);
          $('result').textContent = 'AUTHENTICATED · member session verified.';
        } catch (error) {
          $('result').textContent =
            `AUTH REJECTED · ${error?.message || 'Authentication failed'}`;
        }
      }

      $('signin').onclick = signIn;
      $('signout').onclick = clearSession;
