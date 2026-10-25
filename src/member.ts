import {assessMemberSession} from './member-session-proof.mjs';
import {createAuthLifecycle, requestAuthJson, isAuthToken, authFailureMessage} from './auth-session-lifecycle.mjs';
      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const FUNCTIONS = `${SUPABASE}/functions/v1`;
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
      const $ = id => document.getElementById(id);
      const auth = createAuthLifecycle();

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
        auth.clear();
        try { sessionStorage.removeItem('tfa_session'); } catch {}
        $('signin').disabled = false;
        $('signin').removeAttribute('aria-busy');
        $('session').classList.add('hidden');
        $('access').textContent = 'NOT VERIFIED';
        $('sessionDetail').textContent = '';
        $('password').value = '';
        $('result').textContent = 'Session cleared.';
      }

      async function verifySession(token, attempt) {
        const {response, data} = await requestAuthJson(`${FUNCTIONS}/member-session`, {
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }, {attempt, timeoutMs: 8000});
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
        if ($('signin').disabled) return;
        const email = $('email').value.trim();
        const password = $('password').value;
        if (!email || !password) {
          $('result').textContent = 'Email and password are required.';
          return;
        }
        // Never keep a previous member's token while switching accounts.
        // A new token must be validated before it can enter sessionStorage.
        clearSession();
        const attempt = auth.begin();
        $('signin').disabled = true;
        $('signin').setAttribute('aria-busy', 'true');
        $('result').textContent = 'Authenticating...';
        try {
          const {response, data} = await requestAuthJson(
            `${SUPABASE}/auth/v1/token?grant_type=password`,
            {
              method: 'POST',
              headers: { apikey: KEY, 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password }),
            }, {attempt, timeoutMs: 10000}
          );
          if (!response.ok)
            throw Object.assign(new Error('auth_rejected'), {status: response.status});
          if (!isAuthToken(data?.access_token))
            throw new Error('auth_token_unverified');
          const verdict = await verifySession(data.access_token, attempt);
          attempt.assertCurrent();
          saveSession(data);
          $('result').textContent = verdict.paid_or_owner
            ? 'AUTHENTICATED · verified paid/owner access.'
            : 'SIGNED IN · LIMITED ACCESS. Paid research is locked.';
        } catch (error) {
          if (!attempt.isCurrent()) return;
          $('password').value = '';
          clearSession();
          $('result').textContent =
            `AUTH REJECTED · ${authFailureMessage(error)}`;
        } finally {
          if (attempt.isCurrent()) {
            $('signin').disabled = false;
            $('signin').removeAttribute('aria-busy');
            $('password').value = '';
          }
        }
      }

      $('signin').onclick = signIn;
      $('signout').onclick = clearSession;
      window.addEventListener('pagehide', () => {
        auth.clear();
        $('signin').disabled = false;
        $('signin').removeAttribute('aria-busy');
        $('password').value = '';
      });
