# V295.1 · Atomic SQL syntax correction

On 2026-10-25 the first V295 production migration was rejected with PostgreSQL SQLSTATE **42601** near a malformed source-regex line. The Supabase migration action was atomic: the original reconciler remained installed, with its existing SECURITY DEFINER, search_path and EXECUTE grants. No matrix row, permission, cron or report was modified.

Root cause: the original checked-in SQL artifact was assembled with a JavaScript `String.replace(search, replacementString)`, whose replacement-string meta token `$'` unintentionally expanded to the remaining suffix of the PostgreSQL source whenever the source regex ended in `$'` (e.g. `'^[0-9]{1,4}$'`). This duplicated and corrupted the SQL body. The original CI only asserted presence of safety substrings; it did not parse/validate the full SQL function.

V295.1 reconstructs the **single** PL/pgSQL function from its exact audited rollback definition, using string-index slicing rather than replacement-string interpolation; source now 7.4 KB rather than 15.8 KB. Adds full-function lexical structure regression assertions: single declaration, one dollar-quoted body, one matrix insert, one loop and return, exact summary regex closure, SECURITY DEFINER unchanged, safe search_path and 0R invariant.

Do not retry until 68+ exact-commit CI workflows pass, original production `pg_get_functiondef` matches rollback text, privileges remain only postgres/service_role, and severe incidents are zero. The migration is **still not proof** of restored private QA or 9/9 production smoke. Failed transports must stay CRITICAL and no synthetic 0/1 QA row should be inserted after deployment.
