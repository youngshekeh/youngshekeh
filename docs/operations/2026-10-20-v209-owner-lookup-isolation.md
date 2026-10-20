# V209 private owner lookup isolation (20 Oct 2026 UTC)

V208 production heartbeat at 17:20 UTC passed mandatory KERNEL_SEAL, then failed after ~29s at LOAD_OWNERS (REST timeout). Direct SQL management reads remained intermittent. The seal-stage improvement did not prove full kernel recovery.

V209 applies the same existing private SQL transaction-pooler route to the next read-only dependency: selection of at most 20 active owner user IDs from public.owner_users. Authenticated private invocation is required before the lookup. No public user IDs are exposed in logs or HTTP bodies. An empty, valid SQL result is fail-closed (no_active_owner). A SQL transport error falls back to the same original REST query, which must return successfully before execution.

A one-connection pooler limit, four-second connect timeout, nine-second query limit, no prepared statements, no type catalog fetching, and connection cleanup keep the probe bounded. All write operations (ensurePolicy/upsert, begin run, recover dispatches, finish run) remain on the original secured PostgREST routes, as do downstream V179 calls.

Safety: never bypass seal, OIDC, REST write checks, WAIT/0R or trading locks; no scheduler changes, table or policy migrations. Roll back the Edge function to source commit 8d749a38adf60994d015a14628984cb411b01980 if behavior regresses.

Validation: PASS security CI before deploy. An error later at POLICY confirms progress in isolation, not production recovery. Declare healthy only after two successive successful complete kernel cycles and successful scheduled job receipts.
