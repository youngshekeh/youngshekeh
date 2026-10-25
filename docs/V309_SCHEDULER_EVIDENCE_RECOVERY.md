# V309 · Bounded pg_cron Recovery Evidence and Launch HOLD

**October 25, 2026 · THE FATHER ANALYTICS™**. This is a read-only evidence toolkit, not a production database repair or automatic launch control.

## What was actually observed
- Production: V308 `6a863f10511260704fd969527e3ff904baba1cd3`, Vercel READY. Public recovery reports `POSTGREST_RUNTIME_UNAVAILABLE`; intermittent Supabase SQL connection timeouts persist.
- Live scheduler metadata: **96 cron jobs**, **58 active**, including protected core job 44 at minutes 11/26/41/56.
- The 58 active five-field schedules were copied into **frozen test fixtures** (not executable SQL). A seven-day nominal clock model found a **maximum six simultaneous scheduled starts per minute**. That is *not* a claim of six concurrent jobs: jobs running longer than one minute can overlap, and connection timeouts can occur at lower concurrency during I/O starvation.
- A bounded real query using `order by runid desc limit 240` returned **240 recorded runs**, of which **40 succeeded**, **200 failed** and **191** included `job startup timeout`; 40 distinct job IDs, start times from **12:51 to 14:33 UTC**. This supports a shared scheduler/connection failure, not a single buggy core function.
- Separate one-hour Supabase logs include PostgREST timeouts, Supavisor authentication timeouts, PostgreSQL client SSL connection resets. A provider email on Oct 19 reported depleting Disk I/O budget, but *current* budget utilisation is not independently measured.
- Table `public.intelligence_events` has an estimated 1018 rows and event_time index; an isolated timed-out read is **not enough evidence** to justify adding a new index while I/O is constrained.

## Safe operational rule
**Do not mass-stagger all 58 jobs.** Static starts have a nominal peak of six per minute; the actual number of *simultaneously running jobs* remains unmeasured. Supabase documents up to 32 concurrent pg_cron jobs and advises inspecting worker health, overlapping execution and database resource exhaustion. Request provider support diagnosis before changing schedules or compute.

## Bounded, read-only SQL evidence
Run only when SQL transport permits, separately, with no automatic retry loops:

```sql
select jobid, schedule, active from cron.job order by jobid;
select runid, jobid, status, start_time, end_time, return_message
from cron.job_run_details order by runid desc limit 240;
```

Use the real query output locally, omitting usernames, arbitrary commands and payloads. Create a local JSON object with `jobs`, `runs`, `observed_at` (timestamp of the read), and `expected_limit:240`. Then run:

```sh
node scripts/v309-review-cron-evidence.mjs < local-private-evidence.json
```

The CLI is offline, reads only stdin and emits aggregate JSON. Exit code 2 is **HOLD**; exit code 0 is **eligible only for independent private retesting**. It checks sample completeness, unique descending run IDs, freshness, 30-minute coverage, zero recent startup errors and completion of recent work; never certifies private health, commercial launch, trading, or authorizes a migration. Never pipe secrets or private customer payloads.

## Launch recovery sequence
1. Continue provider ticket **SU-523502** with the bounded 240-run evidence and Disk I/O/CPU I/O wait, PostgREST/Supavisor, and pg_cron worker diagnostics. Obtain confirmed cause and safe remediation.
2. Resolve startup/connectivity; verify provider kernel and 30-minute job records **without altering job schedules**.
3. Separately satisfy V306 source lock and recent global logs; only then review V304 bounded-query repair against exact current source, ACL and rollback.
4. Reverify signed private kernel runs, Auth, licensed Gold/BTC/Oil feed freshness, 107 QA probes, Chromium, and payment entitlement. Checkout and live order submission stay disabled until separately authorized.

References:
- https://supabase.com/kb/troubleshooting/pgcron-debugging-guide-n1KTaz
- https://supabase.com/kb/troubleshooting/exhaust-disk-io

**No database, cron, credentials, RLS, payment, broker or market feed mutations are part of V309.** Preserve every existing system, commercial HOLD and trading WAIT / 0R.
