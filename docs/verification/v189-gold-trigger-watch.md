# V189 Gold Trigger Watch

V189 supersedes the old V124 level watcher on the Gold Live surface with lifecycle-aware review triggers.

Inputs:
- canonical V188.1 lifecycle snapshot only.

Triggers:
- V186 live XAUUSD bridge readiness
- next Tokyo/London/New York signal window and countdown
- Daily lower tradeable-zone touch/approach
- Weekly lower tradeable-zone touch/approach
- nearest session-liquidity proximity
- liquidity reclaim/acceptance transition
- failed-breakout review state

A V189 HUMAN_REVIEW_READY state requires:
1. confirmed Signal Day
2. active Signal Time
3. fresh broker XAUUSD
4. resolved liquidity transition

Even then, V189 emits only a human-review prompt. It never grants capital or submits an order. WAIT / 0R is immutable in this layer.
