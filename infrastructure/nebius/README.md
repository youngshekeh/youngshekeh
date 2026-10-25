# THE FATHER ANALYTICS • Nebius compute bootstrap V312

## Scope
This is the **first, isolated cloud compute deployment** for the autonomous machine.
It is deliberately a read-only, outbound-only shadow observer, **not** a claim that Nebius
is currently hosting the full production kernel. The website remains on Vercel and
the authoritative database remains on Supabase Pro.

The worker fetches only `GET https://thefatheranalytics.com/api/public-recovery-triage`
every **10 minutes**, exposes container-local `/healthz`, `/readyz`, and `/status`,
and emits bounded machine-readable diagnostic logs. It does not hold any API keys,
access internal SQL, issue jobs, publish reports, initiate payments, or place trades.

## Nebius operator runbook (requires an actual Nebius AI Cloud project)
1. In https://console.nebius.com/ create/select an organization, cloud project and billing setup.
2. Start with a small **CPU VM**, not an expensive GPU. Choose an up-to-date
   supported OS image, private/restricted SSH access, SSH key auth, and a small
   persistent boot disk. Review the invoice estimate and account quotas first.
3. Install Docker Engine + Compose from their verified vendor packages and
   use least-privilege administrative access. Restrict firewall ingress.
4. Clone the repository and check out the **reviewed and approved**
   `the-father-analytics-deploy` revision containing V312:
   `git clone https://github.com/youngshekeh/youngshekeh.git && cd youngshekeh`
   `git checkout the-father-analytics-deploy`
5. Deploy: `docker compose -f infrastructure/nebius/compose.yaml up -d --build`.
   Port 8080 is bound to VM loopback only; use SSH port-forwarding for inspection:
   `ssh -L 8080:127.0.0.1:8080 <user>@<vm-ip>` then
   `curl -fsS http://127.0.0.1:8080/healthz` and
   `curl -sS http://127.0.0.1:8080/status`.
6. Verify timestamps, HTTP responses, and any provider incident. An HTTP 200
   from the upstream confirms only observation transport, **not** data freshness
   or cleared launch gates. Keep payments and trading locks unchanged.

## Verification and roll back
Run `node --test tests/v312-nebius-shadow.test.mjs` before approving the PR.
The Compose service is self-contained and does not modify Vercel/Supabase.
For removal on the VM run `docker compose -f infrastructure/nebius/compose.yaml down`.
No production domain, DNS, migrations, secrets or cron schedules change.

## Next gate to move real compute onto Nebius
- Prove a Nebius VM exists and can run this observer reliably.
- Verify V284+ full commercial security and payment gates separately.
- Resolve/characterize Supabase incident SU-523502 before increasing provider reads/writes.
- Extract and migrate **one existing scheduled compute engine** with documented
  lease/idempotency, checkpointing, replay tests, audit logs and a rollback flag.
  Run it in dual-read-only shadow mode first. Switch the engine scheduler only
  after it has an owner-reviewed, measured zero-duplicate acceptance record.
- Separate product: Nebius Token Factory advisory PR #137 is unmerged and
  requires a different inference API credential. Do not confuse its API with
  infrastructure VM provisioning or merge old code without rebasing and retesting.
- Pin the base image to a reviewed digest after supply-chain scan, and establish
  alerting, backups and a monthly budget before any production transfer.

No Nebius resources have been provisioned by this PR.
