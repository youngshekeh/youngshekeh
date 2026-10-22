# V240 · Public market route readiness

Base: V239 production commit `8bd0f14176f77e1d59be43d3ae8641cd45b51219`.

Gold Live, Live Markets and Visual Lab now mount the same independent public
Gold/BTC reference observer as the homepage. Its bounded polling, provenance,
source/receipt timestamp distinction and per-second quote expiry apply on all
four pages. The light editorial panel appears before the existing broker
readiness panel; private engines, MT5 fields and their permissions stay separate.
No new providers, database queries, trading routes or payment actions are added.

The complete local baseline found 496/498 passing tests. One exposed a real
`ReferenceError` in the V12 completed-bootstrap branch: the response used an
undefined `operator_path` variable instead of `operatorPath`. That path now
returns its expected value and retains WAIT/0R. The other failure was a V5
fixture omitting `ok:true` on otherwise healthy sources. The fixture now models
confirmed sources; an additional test ensures unconfirmed sample counts remain
unknown and cannot qualify for probability publication.

The new CI job runs the entire repository suite. Route integration checks mount
the actual shared observer against each page's IDs, show an attributed response,
and verify quote expiry without hidden-page polling.

Provider-dependent autonomous QA is a separate test system. During pre-release
inspection it opened its pressure circuit after dependency timeouts and withheld
43 of 57 planned probes. This release does not certify that private QA, broker
data, paper fills, paid checkout or full engine operation is recovered.

Local validation: all 502 repository tests pass; Vite production build passes.
The managed preview renders the new panel ahead of broker readiness. Local Vite
does not serve the production API routes, so provider-unavailable rendering was
verified there; live provider responses require the production endpoint check.
The Vite development host allowlist explicitly includes terminal.local for QA.
