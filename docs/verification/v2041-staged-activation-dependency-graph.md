# V204.1 staged activation dependency graph

V204 no longer calls the nested V197 anchor guard before V196 feed quality can pass.

Order:
1. V195 bridge readiness
2. V196 feed quality
3. V199 relay observability
4. V202 relay audit ledger
5. V197 live-anchor certification only after V196 reaches LIVE_FEED_QUALITY_PASS

This reduces duplicate upstream pressure during commissioning while preserving fail-closed WAIT / 0R governance. The anchor is represented as NOT_YET_REQUIRED before the feed-quality gate is reachable, not as certified.
