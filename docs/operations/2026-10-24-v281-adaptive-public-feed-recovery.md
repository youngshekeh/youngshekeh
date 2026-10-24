# V281 · Adaptive public feed incident containment
UTC date 2026-10-24. Baseline SHA `86fe994033d32b78aa399b2eb17526ae8ab1784b`.

## Read-only verified incident evidence
At about 11:24 UTC a management query succeeded with 24 PostgreSQL sessions and 58 active cron jobs; three deeper diagnostic SELECTs timed out. A separate last-30-minute aggregate captured **5 PGRST003 postgrest pool timeout log records (82 postgrest logs); 6 Supavisor authentication timeout log records (40 supavisor logs); 27 PostgreSQL cron startup timeout records and 10 statement timeout records (142 postgres logs)**. These are text-matched event counts, not request error rates or proof that cron caused the outage. External Vercel recovery triage reported Auth timeout, HTTP 401 from PostgREST, and `DATABASE INCIDENT REPORTED`. Supabase root cause remains unresolved. Do not disable 58 scheduled jobs, terminate sessions or weaken RLS without provider diagnosis.

## Actual safe load fix
Previously the shared read-only public provider gate used a fixed 4s cooldown after every failed upstream attempt. During repeated database failure, every 4s a new request could reach the same failing Supabase feed **per Vercel instance**. This change uses a separately tracked, exponential cooldown per feed:
- Generic research feeds: 4, 8, 16, 32, 60 seconds maximum
- Gold source feed: 4, 8, 12 seconds maximum to restore fresh research sooner
- Paper broker quote: 4 seconds maximum and NO positive caching
A successful verified `ok:true` read clears the streak, with unchanged healthy cache TTL (15s generic, 1s Gold, no paper caching). A failed attempt removes prior cached success and always returns fail-closed 503. Duplicated concurrent reads remain coalesced. The 503 now includes a bounded `Retry-After` header, reflecting **local retry suppression, not ETA for provider recovery**.

Vercel function instances do not share this state. This is incremental application-side load containment and cannot directly repair database compute, PostgREST pooling, Supavisor Auth or existing cron. We do not change market-source APIs, quote timestamps, data rights, cron schedules, customer access, Supabase SQL, provider billing, or trading. `WAIT / 0R`, new charges OFF. Commercial hold until supported database root-cause diagnosis, stable SQL/Auth, backed-up restore, verified subscription/payment entitlements and two independent sealed kernel runs.
