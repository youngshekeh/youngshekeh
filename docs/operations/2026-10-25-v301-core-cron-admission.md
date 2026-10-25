# V301 | Postgres cron startup pressure mitigation
Date: October 25, 2026 UTC.

## Measured production fault
Postgres logs explicitly show cron job 44 startup timeouts at 09:52 and 10:22 UTC, simultaneous with operations watch job 41 failures. Other jobs also have startup timeouts, SSL reset events and SQL statement timeouts. The latest machine-state record was 09:22 UTC, older than 60 minutes at 10:23. The database has 58 active scheduled jobs, configured cron.max_running_jobs=32 and max_connections=60. Supabase documentation advises no more than eight concurrent running jobs. A stale stored ONLINE field is not a live database health attestation.

## Change and rollback
Safely stagger only the V70 core job id 44 from minute 07/22/37/52 UTC to 11/26/41/56 UTC. Retain exact fifteen-minute cadence, stored function command, active flag, historic job id, role, grants and run history. The independent operations watcher id 41 remains at 07/22/37/52. Before mutation the SQL verifies both original configurations and afterwards validates job 44's new config, failing transactionally if drift occurs. The separate rollback script restores exactly 07/22/37/52 with independent safeguards. No SQL cron unschedule or delete.

Scheduled job collision count before this change across all 58 configured jobs at the old core minutes: 5,6,4,4. At the proposed new minutes: 2,2,2,2 before accounting for day-of-week. This is a narrow congestion-reduction attempt, not a guarantee the database is healed.

## Release
Run exact SHA CI, all repository regression, Chromium, Supabase safety and new V301 tests. Verify production target and live cron job names/commands before applying the migration. This is a DB-only operational release: omit [deploy] so Vercel frontend remains unchanged. Apply exactly one audited cron.alter_job statement wrapped with drift validation. Re-read cron.job. Only conclude a recovered autonomous core after a genuine successful execution on the revised cadence and updated autonomous_machine_state timestamp. Don't invoke refresh manually during connection saturation.

Do not enlarge max_connections, restart the database, disable a safety watcher, modify RLS, pause trading firewalls, alter QA counts or enable checkout. Private QA 77/107, production smoke 8/9, checkout HOLD, trading WAIT / 0R remain hard launch blockers. If startup failures remain, escalate to Supabase provider support with timestamped cron and SSL logs, and conduct a separate indexing / compute-capacity incident review.
