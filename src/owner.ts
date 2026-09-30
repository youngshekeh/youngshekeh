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

      const REVIEW_LABELS = {
        EVIDENCE_SUPPORTIVE: 'Evidence supportive',
        EVIDENCE_CONTRADICTORY: 'Evidence contradictory',
        EVIDENCE_INCONCLUSIVE: 'Evidence inconclusive',
        DEFERRED: 'Defer',
      };

      function textEl(tag, text, className) {
        const el = document.createElement(tag);
        el.textContent = text;
        if (className) el.className = className;
        return el;
      }

      function renderReviewInbox(data) {
        $('reviewInbox').classList.remove('hidden');
        const counts = data?.counts || {};
        $('reviewState').textContent = 'AAL2 REVIEW READY';
        $('reviewState').className = 'value good';
        $('reviewPending').textContent = String(counts.pending_directional || 0);
        $('reviewReviewed').textContent = String(counts.reviewed_directional || 0);
        $('reviewDirectional').textContent = String(counts.directional_candidates || 0);
        $('reviewDetail').textContent =
          `Classifier ${data?.classifier_version || 'WITHHELD'} · append-only evidence judgments · capital remains 0R.`;

        const host = $('reviewQueue');
        host.replaceChildren();
        const queue = Array.isArray(data?.queue) ? data.queue : [];
        if (!queue.length) {
          host.appendChild(textEl('p', 'No directional review candidates are currently available.', 'muted'));
          return;
        }

        for (const item of queue) {
          const card = document.createElement('article');
          card.className = 'card';
          card.style.marginTop = '10px';

          const title = textEl(
            'div',
            `${item.direction || 'UNCLASSIFIED'} · ${item.transition_code || 'EVENT'} · ${item.source_state || 'STATE UNKNOWN'}`,
            'value'
          );
          card.appendChild(title);
          card.appendChild(
            textEl(
              'p',
              `Request #${item.review_request_id} · ${item.review_stage || 'REVIEW'} · source ${item.source_price ?? 'n/a'} · history ${item.review_history_count || 0}`,
              'muted'
            )
          );

          if (item.latest_review) {
            card.appendChild(
              textEl(
                'p',
                `Latest human judgment: ${item.latest_review.decision || 'WITHHELD'} · ${item.latest_review.event_at || 'time withheld'}`,
                'muted'
              )
            );
          }

          const note = document.createElement('textarea');
          note.rows = 2;
          note.maxLength = 500;
          note.placeholder = 'Optional evidence note. Do not enter passwords, API keys, or broker credentials.';
          note.style.width = '100%';
          card.appendChild(note);

          const actions = document.createElement('div');
          actions.className = 'row';
          actions.style.marginTop = '10px';
          actions.style.flexWrap = 'wrap';

          for (const decision of data?.decision_options || Object.keys(REVIEW_LABELS)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'secondary';
            button.textContent = REVIEW_LABELS[decision] || decision;
            button.onclick = async () => {
              const buttons = actions.querySelectorAll('button');
              buttons.forEach((x) => (x.disabled = true));
              $('reviewDetail').textContent = `Recording ${decision} for request #${item.review_request_id}...`;
              try {
                const result = await functionPost('owner-gold-review-actions', {
                  action: 'record',
                  review_request_id: item.review_request_id,
                  decision,
                  note: note.value,
                });
                $('reviewDetail').textContent =
                  `Recorded ${result?.event?.decision || decision} · evidence ${String(result?.event?.evidence_sha256 || '').slice(0, 12)}… · capital 0R.`;
                await loadReviewInbox();
              } catch (error) {
                $('reviewDetail').textContent =
                  error?.message || 'Human review could not be recorded.';
                buttons.forEach((x) => (x.disabled = false));
              }
            };
            actions.appendChild(button);
          }
          card.appendChild(actions);
          host.appendChild(card);
        }
      }

      async function loadReviewInbox() {
        try {
          const data = await functionPost('owner-gold-review-actions', { action: 'queue' });
          renderReviewInbox(data);
        } catch (error) {
          $('reviewInbox').classList.remove('hidden');
          $('reviewState').textContent = 'REVIEW INBOX LOCKED';
          $('reviewState').className = 'value bad';
          $('reviewDetail').textContent = error?.message || 'Owner review inbox unavailable.';
        }
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
          await loadReviewInbox();
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
          await loadReviewInbox();
        } catch (error) {
          $('mfaDetail').textContent =
            error?.message || 'MFA verification failed.';
        }
      }

      $('signin').onclick = signIn;
      $('verify').onclick = verifyMfa;
      $('reviewRefresh').onclick = () => loadReviewInbox();
