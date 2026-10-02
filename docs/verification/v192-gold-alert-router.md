# V192 Event Intelligence + Alert Router

V192 converts new V191 material-state transitions into prioritized review alerts.

## Classifier
- Priority score is deterministic review priority, not probability.
- CRITICAL: Human Review Ready.
- HIGH: active Signal Time, live XAUUSD connection, resolved liquidity transition, session-liquidity touch, Daily/Weekly zone touch.
- MEDIUM: preparation windows, armed liquidity transitions, proximity approaches, failed-breakout review and selected lifecycle transitions.
- LOW/INFO: blocked live-data state and low-value state changes.

## Routing
- Dashboard threshold: 50/100.
- Notification threshold: 80/100.
- Same-alert cooldown: 15 minutes.
- Historical retrofit is disabled, so V191's 13 baseline events are not replayed as new alerts.
- Each future V191 insert is routed synchronously by a database trigger.
- Alert routes are append-only and SHA-256 hash chained.

## External transport
External transport is disabled by default and no destination is configured. V192 therefore produces dashboard review alerts only. Enabling a Telegram/webhook/email transport is a separate explicit configuration step.

## Governance
Priority alerts never change execution authority: WAIT / 0R, automatic execution off, live order submission off.
