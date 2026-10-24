# THE FATHER ANALYTICS · V268 production acceptance engine
**Date:** 2026-10-24 UTC. **Baseline:** `3221348142bccdd1b5c86bf82c86502591d13420` (V267).

## Goal
Automate **exact-production-commit** public release verification after GitHub production merges, separately from the private kernel and payment gates. This is a small, source-controlled independent verifier, **not** a substitute for authenticated Supabase SQL, broker execution quotes, or provider merchant sign-off.

## Observations before this build
- V267 production READY and public market feed/quarterly zone endpoints accessible.
- At **05:11:09 UTC** direct management `SELECT now()` succeeded once, but three immediate read-only follow-up SQL requests (cron inventory/run counts and market snapshot freshness) timed out again; therefore database recovery remains **unverified**.
- Public `/api/public-recovery-triage` reported `DATABASE INCIDENT REPORTED`. The private kernel's V180 heartbeat had repeated `KERNEL_SEAL` failures. Trading remains OFF and capital permission `WAIT / 0R`.
- The market-feed packet contained fresh weekend Bitcoin observations and Friday timestamps for closed-market Gold/DXY/Brent; this distinction is required when vetting market freshness.

## Acceptance boundaries
1. GitHub Actions after production-branch push first waits for Vercel's **exact Git SHA** in `/api/release-attestation`, never accepts a green previous deployment. Maximum 12 bounded attempts, 15 seconds between checks; no open-ended loops.
2. Confirm `/status` is delivered and read-only market feed is sourced recently, Gold capital permission remains `0R`, decision is WAIT, and Bitcoin 24/7 source observation is within 10 minutes. Closed Gold reference is **not** claimed live because a new packet was generated.
3. Independent Gold/BTC research references, 9-asset quarterly zone research, and database diagnostic are checked independently. External source outages are explicitly unverified, not spoofed successes. Any **positive unsafe** packet (live trading, commercial license claim, orderbook fact claim or recovery side effects) fails public admission.
4. The release output can only say `PUBLIC_RESEARCH_ACCEPTED_COMMERCIAL_UNVERIFIED`. Commercial launch, the private kernel, broker quality, forecast accuracy and paid entitlement are **never** automatically certified.
5. No Service Role key, private OIDC calls, DB SQL, cron mutation, API write calls or payment initiation. CI logs contain no prices or personal customer data, only proof booleans and HTTP statuses.

## GitHub process and backup truth
- On PR, run pure fixture tests; after production push, run the real no-credential production smoke.
- Keep the executed workflow logs on GitHub and source code in Git history.
- Source and operations are backed by Git versioning. No complete Supabase table/file backup is verified while database connections remain unreliable.

## Provider recovery remains independent
See [V267 P0 database incident](2026-10-24-v267-p0-database-incident.md).
Provider support must resolve pool/auth/pg_cron issues and two independently sealed fresh kernel cycles must pass before private release. Auth and current active subscription entitlement remain human-gated.
