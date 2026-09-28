# THE FATHER ANALYTICS External Provenance Anchor

This branch is a second-system audit surface for THE FATHER ANALYTICS provenance checkpoints.

## Purpose

Each anchor records the public-safe V110 checkpoint proof returned by:

`https://thefatheranalytics.com/api/mission-brief?proof=checkpoint`

The source checkpoint is produced in Supabase after:

1. V107 append-only evidence receipts
2. V108 Vault-backed HMAC attestations
3. V109 key-lifecycle verification
4. V110 whole-ledger checkpointing

## What this branch proves

- A checkpoint root was observed by GitHub at a separate time from the Supabase database.
- The observed proof is preserved in Git history.
- The checkpoint root, previous root, HMAC, key name and integrity counters can be compared with the source system.

## What this branch does not prove

- It is not a public-key digital signature.
- It does not make GitHub or Supabase mathematically immutable.
- It does not grant trading permission, capital, or model accuracy.
- It does not replace the source provenance ledger.

Anchoring is descriptive and audit-oriented. Capital permission remains 0R.
