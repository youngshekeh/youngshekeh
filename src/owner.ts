      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const FUNCTIONS = `${SUPABASE}/functions/v1`;
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
      const $ = id => document.getElementById(id);
      let accessToken = null;
      let factorId = null;

      async function functionPost(path, body) {
        const response = await fetch(`${FUNCTIONS}/${path}`, {
          method: 'POST',
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw Object.assign(new Error(data?.error || path), {
            status: response.status,
            data,
          });
        return data;
      }

      async function checkOwner() {
        const response = await fetch(`${FUNCTIONS}/member-session`, {
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data?.error || 'owner_session_failed');
        if (data?.is_owner !== true)
          throw new Error('Authenticated account is not authorized as owner');
      }

      async function loadMfa() {
        const status = await functionPost('owner-mfa-actions', {
          action: 'status',
        });
        $('mfa').classList.remove('hidden');
        if (!status.mfa_enrolled) {
          $('mfaState').textContent = 'ENROLLMENT REQUIRED';
          $('mfaState').className = 'value wait';
          $('mfaDetail').textContent =
            'No verified owner MFA factor is enrolled. Use the existing protected Owner Portal to enroll an authenticator.';
          return;
        }
        if (status.aal2) {
          $('mfaState').textContent = 'AAL2 READY';
          $('mfaState').className = 'value good';
          $('mfaDetail').textContent =
            'Owner verification and MFA are active for this session.';
          return;
        }
        factorId = status?.factors?.[0]?.id || null;
        $('mfaState').textContent = 'MFA REQUIRED';
        $('mfaState').className = 'value wait';
        $('mfaDetail').textContent =
          'Enter the current authenticator code to upgrade this owner session to AAL2.';
        $('code').classList.remove('hidden');
        $('verify').classList.remove('hidden');
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
          accessToken = data.access_token;
          await checkOwner();
          $('result').textContent = 'OWNER VERIFIED · checking MFA.';
          await loadMfa();
        } catch (error) {
          $('result').textContent =
            `OWNER ACCESS CHECK · ${error?.message || 'Authentication failed'}`;
        }
      }

      async function verifyMfa() {
        try {
          const code = $('code').value.trim();
          if (!code) {
            $('mfaDetail').textContent = 'Enter the authenticator code.';
            return;
          }
          const result = await functionPost('owner-mfa-actions', {
            action: 'verify',
            factor_id: factorId || undefined,
            code,
          });
          if (result?.session?.access_token)
            accessToken = result.session.access_token;
          if (result?.access_token) accessToken = result.access_token;
          $('mfaState').textContent = 'AAL2 READY';
          $('mfaState').className = 'value good';
          $('mfaDetail').textContent =
            'Owner MFA verified. Protected owner command is unlocked.';
          $('code').classList.add('hidden');
          $('verify').classList.add('hidden');
        } catch (error) {
          $('mfaDetail').textContent =
            error?.message || 'MFA verification failed.';
        }
      }

      $('signin').onclick = signIn;
      $('verify').onclick = verifyMfa;
