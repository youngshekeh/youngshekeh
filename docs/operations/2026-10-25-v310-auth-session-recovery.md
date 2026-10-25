# V310 · Cancellable member access and strict owner MFA

Baseline: V309 production commit `7c0e9106bb91f02bf847db8e55bdb3f7a3068817`.

## Fixed user-visible failures

Member and owner password requests previously had no deadline. Clearing a
session or switching accounts did not invalidate a pending response, so a late
response could restore a cleared session. Owner verification also accepted a
bare `is_owner:true` response without the current member-session semantic proof.

- Password requests now have a 10-second deadline; member/owner proof has an
  8-second deadline. Owner operations retain their bounded 15-second maximum.
- Each login owns an abortable request lifetime. Clearing the session, starting
  another login, or leaving the page invalidates older results, including a late
  JSON body from a transport that ignores cancellation. Duplicate sign-in and
  MFA submissions are blocked while pending.
- Owner identity uses the same strict `member-session-v12-strict-paid-term`
  adapter as member access. Owner MFA requires successful, consistent `owner`,
  `mfa_enrolled`, `aal`, and `aal2` evidence. An upgraded token is checked again
  against the owner endpoint before enabling private controls.
- The owner can clear the in-memory session. Member navigation preserves an
  already verified session needed by checkout; pending work is still aborted.
- Password and authenticator fields are cleared. Auth request errors use fixed
  public messages, not arbitrary provider payloads. Credential-bearing requests
  reject foreign origins and redirects and omit ambient browser cookies.
- Both forms have explicit input labels and announced status messages.

Local cancellation does not revoke a remote Supabase session or undo an action
already submitted to a server. Existing server-side authorization and payment
guards remain authoritative and unchanged.

## Verification and production boundaries

Before edits, all **1,025** repository Node tests passed. After implementation,
all **1,037** Node tests passed; the production Vite build passed. The new tests
execute the actual member/owner entrypoints against a fake DOM and intercepted
HTTP, including late password, entitlement, and MFA responses. Existing owner
paper-intake scenarios still pass using fixtures shaped like the current live
member-session v12 and owner-mfa-actions v6 responses.

The managed browser preview rendered both member and owner pages with labels
and the owner clear-session control. New Chromium CI additionally checks eight
mobile browser scenarios using synthetic intercepted Auth. CI outcomes and
deployment receipts must be recorded separately after they complete; a source
test is not a real account login.

## Verified provider blocker

An independent read-only SQL probe succeeded at **2026-10-25 14:56:13 UTC**:
21 connections, 2 active. The immediately preceding 30-minute PostgreSQL log
window still contained **40 cron startup timeout**, **16 connection reset**, and
**9 statement timeout** messages. These are log event counts, not unique
incidents. Security advisor execution itself failed with a connection timeout.
Control-plane `ACTIVE_HEALTHY` therefore does not certify the data plane.

No database repair, migration, scheduler modification, account creation,
password reset, credential rotation, payment activation, charge, live order,
or market-data rights change is included. Provider ticket SU-523502, private
kernel certification, real account/MFA/OAuth acceptance, licensed feed freshness,
and signed billing lifecycle acceptance remain separate launch requirements.
Commercial launch remains **HOLD**; trading remains **WAIT / 0R**.
