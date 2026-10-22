# V231 database admission recovery (2026-10-22)

Source baseline: V230 production commit 9a24cae60774ca06c5396aa4d673fd01a4c33d8a.

## Root-cause evidence, not speculation
- Supabase Edge logs: 7 sequential V180 KERNEL_SEAL transport timeouts at five-minute intervals; 9s SQL pooler deadline then 8s REST fallback deadline.
- Supavisor logs: 22 15-second DB authentication timeouts. Postgres logs: 17 statement timeouts and multiple pg_cron startup timeouts during the reviewed window.
- 58 active database cron jobs, three Gold snapshot jobs (IDs 13,16,17) run on minute multiples of five.
- No evidence that the private security seal was invalid or bypassed. Do NOT treat failed transport as positive verification.
- Last 107-check runtime QA: 77 passed, 30 failed. Live MT5 bridge disconnected, broker quote and paper receipt tables empty.

## Change
Shift only the Vercel heartbeat (same 5-minute frequency, no downtime intended) to minute 4,9,14,...,59, offset from the three Gold snapshot tasks. Preserve database cron, edge functions, security seal, CRON_SECRET, OIDC and all trading/payment hard locks. Add non-sensitive error classification and Retry-After HTTP header.
No pg_cron / table / broker / membership writes. Rollback: revert Vercel schedule to */5 and fallback to V230's original schedule.

## Reality gate
CI tests verify five-minute cadence and fail-closed code, not actual database recovery. Do not claim the kernel is recovered until at least two fresh independently certified success receipts and stable DB connections are observed. No commercial or trade unlock.
