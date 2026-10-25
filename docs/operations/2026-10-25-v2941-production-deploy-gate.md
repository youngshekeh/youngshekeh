# V294.1 Verified Production Release Gate | October 25, 2026

## Why V294 did not auto-deploy after merge
GitHub PR #256 passed 68/68 exact-head CI checks and merged to production branch at `9ec47a1156853afd279caefa981205359313cc26`. Vercel automatically attempted deployment `dpl_Drjt4ADcXGLoJ6nXN6vYxeewiYqS` but canceled during the **Ignored Build Step** before compilation. Exact recorded Vercel command:

```sh
case "$VERCEL_GIT_COMMIT_REF" in
  tfa-q4-visuals|tfa-machine-q4-v2|tfa-machine-q4-v3) exit 1;;
  the-father-analytics-deploy)
    case "$VERCEL_GIT_COMMIT_MESSAGE" in
      *"[deploy]"*) exit 1;;
      *) exit 0;;
    esac;;
  *) exit 0;;
esac
```

The command exits 0 to skip deployments of unmarked production commits and exits 1 to build a marked, intentional production release. This is an **existing cost and safety gate**; do not disable it for convenience.

## Deliberate second release
Create a documentation-only audited PR with this runbook. After separate exact-head CI and signed-off controlled diff review, merge with a message that includes `[deploy]` to trigger Vercel production on the new commit. The V294 implementation must remain identical to the 68/68 approved build except this documentation addition. No source, environment, Supabase Edge, cron, auth, payment, data-license grant, trading or risk changes.

## Verify after deployment
1. Match Vercel production deployment exact `githubCommitSha` to the audited release merge SHA. State must be `READY`, aliases include `thefatheranalytics.com` and `www.thefatheranalytics.com`.
2. GET `https://thefatheranalytics.com/api/public-quarterly-zones`: response must contain `assets.bitcoin:null`, `source_rights.bitcoin.public_quarterly_range_allowed=false`, HTTP header `X-TFA-BTC-Quarterly: LICENSE_HOLD`; six-month Yahoo history providers may be unavailable, so response may be 503. Never substitute forged data for a successful verification.
3. The public quarterly endpoint must not request Coinbase BTC-USD candles; CI V294 test proves exactly eight Yahoo targets.
4. V293 public BTC spot must remain null with `LICENSE_HOLD`, and private trading `WAIT / 0R`, paid checkout HOLD.
5. Read Supabase production smoke and latest full QA evidence **without claiming success**: last full QA 77/107, production smoke 8/9 weekend stale combined snapshot. Keep launch HOLD.

## What is not certified
No commercial market-data rights were acquired by this change. Vendor contracts for Coinbase, Yahoo, Gold API and other published data remain a separate business/legal release gate, along with independent 24/7 Bitcoin verification, smoke 9/9, private QA and subscription acceptance.
