# V210 Commercial Access: production acceptance and rollback

Date: 2026-10-20 UTC. Target: https://thefatheranalytics.com.

## Visible release
- /pricing lists the established Pro, Executive, Business and Enterprise memberships. Never invent USD prices or entitlements.
- USD amounts appear only after a current positive billing-acceptance payload verifies provider plan currency, recurrence and local/provider parity.
- Sales enquiry opens an email, without charging or granting access.
- /checkout is noindex and begins disabled. It requires a real authenticated member, final launch, payment, identity, QA and two healthy kernel run receipts.
- Payments are explicit user click and hosted Flutterwave redirect. A redirect never proves success, and the subscription ledger is authoritative.

## Server-side release gate
- Supabase create-checkout retains verify_jwt=true, checked authenticated user and valid plan IDs.
- Fresh FULL_ACCEPTANCE_READY (10-minute evidence TTL), no incident or blockers, verified LIVE_FLOW_VERIFIED payment acceptance, and at least two distinct recent SUCCEEDED kernel run keys in a 16-minute window are mandatory before any checkout-intent database write or provider call.
- Any probe failure produces checkout_unavailable, no new payment request and no entitlement auto-grant.
- First real controlled purchase must be owner-supervised after core systems recover, with signed webhook, ledger, entitlement and cancellation verification. Never bypass the gate merely to create revenue.

## Current commercial truth
- Public site, evidence-qualified research and commercial enquiries are live.
- Paid recurring self-service remains blocked while REST and kernel are unhealthy. An enquiry is not a completed sale.
- Owner must confirm enterprise deliverables, scope, prices, cancellation and refund terms before any offline money is collected.
- No investment returns or personalized investment advice are promised. Capital firewall remains WAIT / 0R.

## Acceptance checks
1. CI, Vite build, new routes and links all pass.
2. Production /pricing and /checkout render; absent provider verification withholds prices and disables charge.
3. Updated create-checkout Edge version matches reviewed git and retains JWT authentication.
4. Two consecutive successful kernel cycles, market-data freshness and normal scheduled job receipts.
5. Supervised real-payment, webhook, entitlement, account reset and cancellation confirmation before public paid launch.

## Rollback
- Prior Edge create-checkout v8 may be restored from previous deployed revision, keeping verify_jwt=true.
- A CI-reviewed Vercel commit can remove V210 sales routes if necessary.
- No DB schema, global scheduler, order routing or capital permissions changed by V210.