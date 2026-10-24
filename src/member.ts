import {assessMemberSession} from './member-session-proof.mjs';
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
          cache: 'no-store',signal:AbortSignal.timeout(8000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error('member_session_unverified');
        // HTTP 200 alone is never paid/owner authorization. Treat current
        // Supabase member-session v12 semantics as the only server authority.
        const verdict = assessMemberSession(data);
        if (!verdict.authenticated) throw new Error('member_session_unverified');
        $('session').classList.remove('hidden');
        $('access').textContent = verdict.label;
        $('access').className = 'value ' + (verdict.paid_or_owner ? 'good' : 'wait');
        $('sessionDetail').textContent = verdict.description;
        return verdict;
      }

      async function signIn() {
        const email = $('email').value.trim();
        const password = $('password').value;
        if (!email || !password) {
          $('result').textContent = 'Email and password are required.';
          return;
        }
        // Never keep a previous member's token while switching accounts.
        // A new token must be validated before it can enter sessionStorage.
        clearSession();
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
          if (typeof data.access_token !== 'string' || data.access_token.length < 30)
            throw new Error('auth_token_unverified');
          const verdict = await verifySession(data.access_token);
          saveSession(data);
          $('result').textContent = verdict.paid_or_owner
            ? 'AUTHENTICATED · verified paid/owner access.'
            : 'SIGNED IN · LIMITED ACCESS. Paid research is locked.';
        } catch (error) {
          clearSession();
          $('result').textContent =
            `AUTH REJECTED · ${error?.message || 'Authentication failed'}`;
        }
      }

      $('signin').onclick = signIn;
      $('signout').onclick = clearSession;
