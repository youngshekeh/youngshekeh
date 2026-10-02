# V198 Live Session Execution Intelligence

V198 composes V197 certified live-anchor status with V187 Signal Day/Signal Time, V188 lifecycle/session liquidity, V189 trigger-watch review gates and V194 command state.

## Safety hierarchy
V197 certified live anchor is mandatory before any live session opportunity can become reviewable.

V198 also requires state consensus. If V188 and V189 disagree on a material liquidity-transition gate, the state is STATE_CONSENSUS_BLOCKED.

## Human-review requirements
- all upstreams healthy
- V197 live anchor certified
- Signal Day confirmed
- Signal Time active
- tradeable extreme present
- liquidity-transition state agrees across V188 and V189
- liquidity transition resolved
- no material state disagreements

HUMAN_REVIEW_CANDIDATE is not a trade signal and never grants execution or capital. WAIT / 0R remains immutable here.
