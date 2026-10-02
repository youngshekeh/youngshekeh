      import { createPaperQuoteSubmitter, paperQuoteMessage } from './owner-paper-quote.mjs';
      import { paperQuoteView } from './paper-quote-view.mjs';
      import { createSandboxReceiptSubmitter, sandboxReceiptMessage } from './owner-sandbox-receipt.mjs';
      import { prepareBridgeCreate, bridgeInstallSnippet, bridgeControlMessage } from './owner-bridge-control.mjs';

      const SUPABASE = 'https://mpcelmjiycjpdyyflisn.supabase.co';
      const FUNCTIONS = `${SUPABASE}/functions/v1`;
      const KEY = 'sb_publishable_pkeyQh348Kx7ol0AiAMOlw_wCUOnaLb';
      const $ = id => document.getElementById(id);
      let accessToken = null;
      let factorId = null;
      let ownerVerified = false;
      let ownerMfaReady = false;
      let paperQuoteBusy = false;
      let paperStatusBusy = false;
      let paperStatus = null;
      let paperReceipt = null;
      let sandboxBusy = false;
      let sandboxStatusBusy = false;
      let sandboxStatus = null;
      let sandboxLast = null;
      let bridgeBusy = false;
      let bridgeStatus = null;
      let bridgeHealthBusy = false;
      let bridgeHealth = null;

      function lockOwnerPaperQuote() {
        ownerMfaReady = false;
        paperStatus = null;
        paperReceipt = null;
        $('paperQuoteIntake').classList.add('hidden');
        sandboxStatus = null;
        sandboxLast = null;
        $('sandboxReceiptIntake').classList.add('hidden');
        $('sandboxReceiptSubmit').disabled = true;
        $('sandboxReceiptResult').textContent = 'Owner verification and MFA are required.';
        bridgeStatus = null;
        $('bridgeControl').classList.add('hidden');
        $('bridgeCreate').disabled = true;
        $('bridgeConfig').textContent = 'No bridge key has been issued in this session.';
        $('bridgeList').replaceChildren();
        bridgeHealth = null;
        $('bridgeHealthState').textContent = 'CHECKING';
        $('bridgeHealthDetail').textContent = 'No demo client heartbeat confirmed.';
        $('paperQuoteSubmit').disabled = true;
        $('paperQuoteReceipt').textContent = 'No receipt confirmed.';
        $('paperQuoteFeedState').textContent = 'CHECKING';
        $('paperQuoteResult').textContent = 'Owner verification and MFA are required.';
      }

      function renderPaperQuoteStatus() {
        if (!ownerVerified || !ownerMfaReady) return;
        const view = paperQuoteView(paperStatus);
        $('paperQuoteFeedState').textContent = view.state.replaceAll('_', ' ');
        $('paperQuoteFeedDetail').textContent = view.state === 'PAPER_QUOTE_FRESH_UNVERIFIED'
          ? `Demo bid ${view.bid} · ask ${view.ask} · observed spread ${view.spread.toFixed(4)}. Broker provenance remains unverified.`
          : view.state === 'NOT_CONNECTED'
            ? 'No demo source quote is recorded. Live orders remain OFF.'
            : view.state === 'UNAVAILABLE'
              ? 'Status is unavailable. Quote values are withheld.'
              : 'The demo quote is stale or invalid. Quote values are withheld until a fresh source event arrives.';
        if (paperReceipt) {
          const expired = Date.now() >= Date.parse(paperReceipt.expires_at);
          $('paperQuoteReceipt').textContent = `Receipt #${paperReceipt.receipt_id} · ${paperReceipt.inserted ? 'recorded' : 'already recorded'} · ${expired ? 'quote expired' : 'quote expires at ' + paperReceipt.expires_at} · intake only, capital 0R.`;
        }
      }

      async function loadPaperQuoteStatus() {
        if (paperStatusBusy || !ownerVerified || !ownerMfaReady) return;
        paperStatusBusy = true;
        const tokenAtStart = accessToken;
        try {
          const response = await fetch(`${FUNCTIONS}/paper-broker-quote-intake`, {
            headers: { apikey: KEY, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000),
          });
          const data = await response.json().catch(() => null);
          if (accessToken === tokenAtStart && ownerVerified && ownerMfaReady) paperStatus = response.ok ? data : null;
        } catch {
          if (accessToken === tokenAtStart) paperStatus = null;
        } finally {
          paperStatusBusy = false;
          renderPaperQuoteStatus();
        }
      }

      function enableOwnerPaperQuote() {
        if (!ownerVerified || !accessToken) return;
        ownerMfaReady = true;
        $('paperQuoteIntake').classList.remove('hidden');
        $('paperQuoteSubmit').disabled = paperQuoteBusy;
        $('paperQuoteResult').textContent = 'Owner and MFA verified. Submit a fresh demo source event; no automatic submission occurs.';
        $('sandboxReceiptIntake').classList.remove('hidden');
        $('sandboxReceiptSubmit').disabled = sandboxBusy;
        $('sandboxReceiptResult').textContent = 'Owner and MFA verified. Demo/sandbox receipts only; production routing remains locked.';
        void loadPaperQuoteStatus();
        void loadSandboxStatus();
        $('bridgeControl').classList.remove('hidden');
        $('bridgeCreate').disabled = bridgeBusy;
        $('bridgeResult').textContent = 'Owner and MFA verified. Create or inspect sandbox-only bridge credentials.';
        void loadBridgeStatus();
        void loadBridgeHealth();
      }

      const paperSubmitter = createPaperQuoteSubmitter({
        getSession: () => ({token: accessToken, owner: ownerVerified, mfa: ownerMfaReady}),
        send: quote => functionPost('paper-broker-quote-intake', quote, 10000),
      });

      async function submitPaperQuote(event) {
        event.preventDefault();
        if (paperQuoteBusy || !ownerVerified || !ownerMfaReady) return;
        paperQuoteBusy = true;
        $('paperQuoteSubmit').disabled = true;
        $('paperQuoteResult').textContent = 'Submitting one paper source event…';
        try {
          const result = await paperSubmitter.submit($('paperQuoteJson').value);
          if (result.error === 'session_changed') return;
          if (['invalid_session','aal2_required','owner_only'].includes(result.error)) {
            lockOwnerPaperQuote();
            $('result').textContent = paperQuoteMessage(result.error);
            return;
          }
          if (result.ok) {
            paperReceipt = result;
            $('paperQuoteResult').textContent = 'Paper intake receipt confirmed. Broker provenance remains unverified; live orders remain OFF.';
          } else {
            $('paperQuoteResult').textContent = result.message;
          }
          renderPaperQuoteStatus();
          await loadPaperQuoteStatus();
        } finally {
          paperQuoteBusy = false;
          $('paperQuoteSubmit').disabled = !ownerVerified || !ownerMfaReady;
        }
      }

      function renderSandboxStatus() {
        if (!ownerVerified || !ownerMfaReady) return;
        const s = sandboxStatus || {};
        const gates = s.sandbox_gates || {};
        const ev = s.evidence || {};
        $('sandboxState').textContent = String(s.state || 'UNAVAILABLE').replaceAll('_', ' ');
        $('sandboxSpread').textContent = gates.observed_spread_available ? 'OBSERVED' : 'WAITING';
        $('sandboxSlippage').textContent = gates.observed_slippage_available ? 'OBSERVED' : 'WAITING';
        $('sandboxRecon').textContent = gates.order_reconciliation_tested ? 'PASS' : 'WAITING';
        $('sandboxKill').textContent = gates.kill_switch_receipt_observed ? 'OBSERVED' : 'WAITING';
        $('sandboxDetail').textContent = s?.ok === true
          ? `24h receipts ${ev.total_receipts || 0} · quotes ${ev.quote_receipts || 0}/5 · fills ${ev.fill_receipts || 0}/3 · reconciled ${ev.reconciled_fill_receipts || 0} · kill-switch ${ev.kill_switch_receipts || 0}/1. Production broker verification remains false and capital remains 0R.`
          : 'Sandbox certification status is unavailable. Production routing remains locked.';
        if (sandboxLast) $('sandboxReceiptLast').textContent =
          `Receipt #${sandboxLast.receipt_id} · ${sandboxLast.event_type} · ${sandboxLast.inserted ? 'recorded' : 'already recorded'} · sandbox only · capital 0R.`;
      }

      async function loadSandboxStatus() {
        if (sandboxStatusBusy || !ownerVerified || !ownerMfaReady) return;
        sandboxStatusBusy = true;
        const tokenAtStart = accessToken;
        try {
          const response = await fetch(`${FUNCTIONS}/broker-sandbox-receipt-intake`, {
            headers: { apikey: KEY, Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(8000),
          });
          const data = await response.json().catch(() => null);
          if (accessToken === tokenAtStart && ownerVerified && ownerMfaReady) sandboxStatus = response.ok ? data : null;
        } catch {
          if (accessToken === tokenAtStart) sandboxStatus = null;
        } finally {
          sandboxStatusBusy = false;
          renderSandboxStatus();
        }
      }

      const sandboxSubmitter = createSandboxReceiptSubmitter({
        getSession: () => ({token: accessToken, owner: ownerVerified, mfa: ownerMfaReady}),
        send: receipt => functionPost('broker-sandbox-receipt-intake', receipt, 10000),
      });

      async function submitSandboxReceipt(event) {
        event.preventDefault();
        if (sandboxBusy || !ownerVerified || !ownerMfaReady) return;
        sandboxBusy = true;
        $('sandboxReceiptSubmit').disabled = true;
        $('sandboxReceiptResult').textContent = 'Submitting one sandbox evidence receipt…';
        try {
          const result = await sandboxSubmitter.submit($('sandboxReceiptJson').value);
          if (result.error === 'session_changed') return;
          if (['invalid_session','aal2_required','owner_only'].includes(result.error)) {
            lockOwnerPaperQuote();
            $('result').textContent = sandboxReceiptMessage(result.error);
            return;
          }
          if (result.ok) {
            sandboxLast = result;
            sandboxStatus = result.certification || sandboxStatus;
            $('sandboxReceiptResult').textContent = 'Sandbox receipt confirmed. Production broker verification and live orders remain OFF.';
          } else {
            $('sandboxReceiptResult').textContent = result.message;
          }
          renderSandboxStatus();
          await loadSandboxStatus();
        } finally {
          sandboxBusy = false;
          $('sandboxReceiptSubmit').disabled = !ownerVerified || !ownerMfaReady;
        }
      }

      function renderBridgeStatus() {
        if (!ownerVerified || !ownerMfaReady) return;
        const host = $('bridgeList');
        host.replaceChildren();
        const bridges = Array.isArray(bridgeStatus?.bridges) ? bridgeStatus.bridges : [];
        if (!bridges.length) {
          host.appendChild(textEl('p', 'No sandbox bridge has been enrolled.', 'muted'));
          return;
        }
        for (const bridge of bridges) {
          const card = document.createElement('article');
          card.className = 'card';
          card.style.marginTop = '8px';
          card.appendChild(textEl('div', `${bridge.bridge_label} · #${bridge.bridge_id} · ${bridge.active ? 'ACTIVE' : 'REVOKED'}`, 'value'));
          card.appendChild(textEl('p', `${bridge.source_code} · ${bridge.provider_symbol} · requests ${bridge.use_count || 0} · last used ${bridge.last_used_at || 'never'} · production capable false · capital 0R`, 'muted'));
          if (bridge.active) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'secondary';
            button.textContent = 'Revoke bridge';
            button.onclick = async () => {
              button.disabled = true;
              try {
                await functionPost('broker-sandbox-bridge-control', {action:'revoke', bridge_id:bridge.bridge_id}, 10000);
                $('bridgeResult').textContent = `Bridge #${bridge.bridge_id} revoked. Existing key is no longer accepted.`;
                await loadBridgeStatus();
              } catch (error) {
                $('bridgeResult').textContent = bridgeControlMessage(error?.data?.error || 'bridge_revoke_unavailable');
                button.disabled = false;
              }
            };
            card.appendChild(button);
          }
          host.appendChild(card);
        }
      }

      function renderBridgeHealth() {
        if (!ownerVerified || !ownerMfaReady) return;
        const h = bridgeHealth || {};
        const counts = h.counts || {};
        const clients = Array.isArray(h.clients) ? h.clients : [];
        const client = clients[0] || null;
        $('bridgeHealthState').textContent = String(h.state || 'UNAVAILABLE').replaceAll('_', ' ');
        $('bridgeHealthDemo').textContent = client?.trade_mode === 'DEMO' ? 'DEMO VERIFIED' : 'WAITING';
        $('bridgeHealthHeartbeat').textContent = client?.heartbeat_age_seconds == null
          ? 'WAITING'
          : `${client.heartbeat_age_seconds}s`;
        $('bridgeHealthVersion').textContent = client?.relay_version && client?.mt5_package_version
          ? `${client.relay_version} · MT5 ${client.mt5_package_version}`
          : 'WAITING';
        $('bridgeHealthDetail').textContent = h?.ok === true
          ? `Active ${counts.active_bridges || 0} · healthy ${counts.healthy_bridges || 0} · stale ${counts.stale_bridges || 0} · degraded ${counts.degraded_bridges || 0}. Health is operational evidence only; production capital remains 0R.`
          : 'Bridge health is unavailable. Sandbox evidence remains fail-closed.';
      }

      async function loadBridgeHealth() {
        if (bridgeHealthBusy || !ownerVerified || !ownerMfaReady) return;
        bridgeHealthBusy = true;
        try {
          const response = await fetch(`${FUNCTIONS}/broker-sandbox-bridge-health`, {
            headers: {apikey: KEY, Accept: 'application/json'},
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
          });
          bridgeHealth = response.ok ? await response.json().catch(() => null) : null;
        } catch {
          bridgeHealth = null;
        } finally {
          bridgeHealthBusy = false;
          renderBridgeHealth();
        }
      }

      async function loadBridgeStatus() {
        if (!ownerVerified || !ownerMfaReady) return;
        try {
          bridgeStatus = await functionPost('broker-sandbox-bridge-control', {action:'status'}, 10000);
          renderBridgeStatus();
        } catch (error) {
          bridgeStatus = null;
          $('bridgeResult').textContent = bridgeControlMessage(error?.data?.error || 'bridge_status_unavailable');
          renderBridgeStatus();
        }
      }

      async function createBridge(event) {
        event.preventDefault();
        if (bridgeBusy || !ownerVerified || !ownerMfaReady) return;
        const prepared = prepareBridgeCreate({
          label:$('bridgeLabel').value,
          sourceCode:$('bridgeSource').value,
          providerSymbol:$('bridgeSymbol').value,
        });
        if (!prepared.ok) {
          $('bridgeResult').textContent = prepared.message;
          return;
        }
        bridgeBusy = true;
        $('bridgeCreate').disabled = true;
        $('bridgeConfig').textContent = 'Creating one-time bridge credential…';
        try {
          const result = await functionPost('broker-sandbox-bridge-control', prepared.payload, 10000);
          const snippet = bridgeInstallSnippet(result);
          if (!snippet) throw Object.assign(new Error('unverified_bridge_receipt'), {data:{error:'bridge_create_unavailable'}});
          $('bridgeConfig').textContent = snippet;
          $('bridgeResult').textContent = 'Demo bridge created. Copy the one-time key now; the server stores only its hash. Production routing remains OFF.';
          await loadBridgeStatus();
          await loadBridgeHealth();
        } catch (error) {
          $('bridgeConfig').textContent = 'No bridge key was confirmed.';
          $('bridgeResult').textContent = bridgeControlMessage(error?.data?.error || 'transport_unavailable');
        } finally {
          bridgeBusy = false;
          $('bridgeCreate').disabled = !ownerVerified || !ownerMfaReady;
        }
      }

      async function functionPost(path, body, timeout = 15000) {
        const response = await fetch(`${FUNCTIONS}/${path}`, {
          method: 'POST',
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
          signal: AbortSignal.timeout(timeout),
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
        ownerVerified = true;
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

      function renderReviewIntelligence(data) {
        const intel = data?.review_intelligence || {};
        $('reviewIntelligence').classList.remove('hidden');
        $('reviewIntelState').textContent =
          `REVIEW INTELLIGENCE · ${intel?.state || 'WAITING_FOR_HUMAN_REVIEW'}`;
        $('reviewIntelState').className =
          `value ${intel?.state === 'MATURE_REVIEW_EVIDENCE' ? 'good' : 'wait'}`;
        $('reviewIntelAnchors').textContent = String(intel?.post_review_anchors || 0);
        $('reviewIntelOutcomes').textContent = String(intel?.resolved_review_outcomes || 0);
        $('reviewIntelSample').textContent = String(intel?.max_scorable_sample || 0);
        $('reviewIntelCapital').textContent = String(
          intel?.governance?.capital_permission || '0R'
        );
        $('reviewIntelDetail').textContent =
          intel?.state === 'WAITING_FOR_HUMAN_REVIEW'
            ? 'No human evidence judgment exists yet. Nothing is scored or invented.'
            : (intel?.max_scorable_sample || 0) < 10
              ? 'Post-review evidence is collecting. Descriptive statistics remain withheld until n≥10.'
              : 'Descriptive review evidence is available. It cannot promote models or grant capital.';

        const host = $('reviewIntelHorizons');
        host.replaceChildren();
        for (const horizon of intel?.horizons || []) {
          const card = document.createElement('article');
          card.className = 'card';
          card.style.marginTop = '8px';
          const status = horizon?.statistics_withheld
            ? 'STATISTICS WITHHELD'
            : `ALIGNMENT ${horizon?.descriptive_statistics?.human_alignment_rate_pct ?? 'n/a'}% · BASELINE ${horizon?.descriptive_statistics?.baseline_signal_favorable_rate_pct ?? 'n/a'}% · Δ ${horizon?.descriptive_statistics?.observed_value_add_pp ?? 'n/a'}pp`;
          card.appendChild(
            textEl(
              'div',
              `${horizon?.horizon_minutes ?? '?'}m · n=${horizon?.scorable_count ?? 0} · ${status}`,
              'value'
            )
          );
          card.appendChild(
            textEl(
              'p',
              `${horizon?.intelligence_state || 'WAITING'} · auto weight OFF · auto promotion OFF`,
              'muted'
            )
          );
          host.appendChild(card);
        }
      }

      function renderReviewInbox(data) {
        renderReviewIntelligence(data);
        $('reviewInbox').classList.remove('hidden');
        const counts = data?.counts || {};
        $('reviewState').textContent = 'AAL2 REVIEW READY';
        $('reviewState').className = 'value good';
        $('reviewPending').textContent = String(counts.pending_directional || 0);
        $('reviewReviewed').textContent = String(counts.reviewed_directional || 0);
        $('reviewDirectional').textContent = String(counts.directional_candidates || 0);
        $('reviewP1').textContent = String(data?.review_priority?.high_attention_pending || 0);
        $('reviewDetail').textContent =
          `Classifier ${data?.classifier_version || 'WITHHELD'} · routing ${data?.review_priority?.scoring_version || 'WITHHELD'} · oldest-first within equal priority · attention targets are operational only · capital remains 0R.`;

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

          const priorityBand = item?.priority?.priority_band || 'UNRANKED';
          const priorityScore = item?.priority?.priority_score ?? 'n/a';
          const title = textEl(
            'div',
            `${priorityBand} · ${priorityScore} · ${item.direction || 'UNCLASSIFIED'} · ${item.transition_code || 'EVENT'} · ${item.source_state || 'STATE UNKNOWN'}`,
            'value'
          );
          card.appendChild(title);
          card.appendChild(
            textEl(
              'p',
              `Request #${item.review_request_id} · ${item.review_stage || 'REVIEW'} · severity ${item?.priority?.severity || 'UNKNOWN'} · age ${item?.priority?.age_minutes ?? 'n/a'}m / target ${item?.priority?.target_minutes ?? 'n/a'}m · ${item?.priority?.attention_state || 'UNAVAILABLE'} · source ${item.source_price ?? 'n/a'} · history ${item.review_history_count || 0}`,
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
        lockOwnerPaperQuote();
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
        if (status.aal2 === true) {
          $('mfaState').textContent = 'AAL2 READY';
          $('mfaState').className = 'value good';
          $('mfaDetail').textContent =
            'Owner verification and MFA are active for this session.';
          enableOwnerPaperQuote();
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
        lockOwnerPaperQuote();
        ownerVerified = false;
        accessToken = null;
        factorId = null;
        $('reviewInbox').classList.add('hidden');
        $('reviewIntelligence').classList.add('hidden');
        $('reviewQueue').replaceChildren();
        $('reviewIntelHorizons').replaceChildren();
        $('mfa').classList.add('hidden');
        $('code').classList.add('hidden');
        $('verify').classList.add('hidden');
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
          $('code').classList.add('hidden');
          $('verify').classList.add('hidden');
          await loadMfa();
        } catch (error) {
          $('mfaDetail').textContent =
            error?.message || 'MFA verification failed.';
        }
      }

      $('signin').onclick = signIn;
      $('verify').onclick = verifyMfa;
      $('reviewRefresh').onclick = () => loadReviewInbox();
      $('paperQuoteForm').addEventListener('submit', submitPaperQuote);
      $('paperQuoteRefresh').onclick = () => void loadPaperQuoteStatus();
      $('sandboxReceiptForm').addEventListener('submit', submitSandboxReceipt);
      $('sandboxRefresh').onclick = () => void loadSandboxStatus();
      $('bridgeCreateForm').addEventListener('submit', createBridge);
      $('bridgeRefresh').onclick = () => { void loadBridgeStatus(); void loadBridgeHealth(); };
      window.setInterval(() => { if (!document.hidden) renderPaperQuoteStatus(); }, 1000);
