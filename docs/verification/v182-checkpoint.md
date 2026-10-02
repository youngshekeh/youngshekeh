# V182 continuous live market monitoring

Live Markets previously read its cross-asset feed once on page load. Gold refreshed structure every minute but started 41 background engine reads in parallel on every pulse. Browser verification also found the direct backend origin unavailable while same-origin private research endpoints and scheduled capture jobs were healthy.

V182 routes the existing public reads through an exact allowlist at `/api/market-feed`. The bridge accepts GET only, rejects private runtimes and arbitrary URLs, does not forward caller credentials, coalesces overlapping reads and applies a 10-second total upstream deadline without retry. A healthy instance cache lasts 15 seconds; expired cache is never used to hide an upstream failure. Paper quote status is uncached so its 10-second quote expiry remains independent.

Both dashboards refresh every 60 seconds after a request completes while visible, pause while hidden, and resume once overdue. Manual refreshes coalesce with active work. Failed requests do not advance the last successful refresh timestamp. Cross-asset rows show source time, withhold stale/unavailable prices and render provider labels as text. Object-valued market regimes now render their state rather than `[object Object]`.

All 41 Gold background engine readers remain present. They refresh on a five-minute cycle with a three-request ceiling; hidden pages do not start queued checks. Gold structure, broker quote expiry, paper mode and capital governance remain separate.

Baseline evidence on 2026-10-02: six observed Gold/market capture or outcome jobs were active with successful latest cron runs. V181.1 QA was 78/78 PASS. No scheduler, database schema, source-provider subscription, broker connection or trading-permission change is part of V182.

Validation: Node regression suite and Vite production build; production publication and dashboard/endpoint verification are required for release completion. Quotes are indicative research data; real-money execution remains WAIT / 0R with orders OFF.
