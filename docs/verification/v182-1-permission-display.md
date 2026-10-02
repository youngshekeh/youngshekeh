# V182.1 public Gold permission display

V182 production browser verification confirmed six cross-asset rows, current Gold observations, and a successful automatic market refresh with a newer source snapshot. Restoring public feed access also exposed a pre-existing display conflict: upstream research setup fields could render EVALUATE / MAX_0.25R in the public action, Gold firewall, and execution-desk decision labels even though the broker route and real execution remain locked.

V182.1 keeps those public execution labels at WAIT / 0R, including the Visual Lab permission label. Indicative prices and structural states still render from the source feeds. This changes display interpretation only: no broker, order-routing, capital policy, scheduler, or database change is included.

Two actual-loader regressions exercise healthy delayed feeds carrying EVALUATE / MAX_0.25R and confirm that prices remain observable while Live Markets, Gold, the firewall, and the desk preserve WAIT / 0R. Full local tests, release checks, and production browser verification are required before release completion.
