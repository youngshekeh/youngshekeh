# V182.2 public feed deadline alignment

Production verification found that public browser reads still used the previous direct-feed deadlines of 3.5–6.5 seconds after V182 added a same-origin bridge with a 10-second total upstream deadline. Live Markets could abandon an otherwise valid response before the bridge finished, showing UNAVAILABLE even though subsequent reads confirmed healthy market data.

Public reads now allow at least 12 seconds, preserving any longer explicit deadline. The bridge remains bounded at 10 seconds with no retry or expired-cache fallback. Browser failures continue to withhold unavailable rows and do not advance successful refresh time. Local private-runtime reads retain their existing deadlines; paper quote expiry remains independent and real execution stays WAIT / 0R.

Three actual-reader regressions reproduce a healthy seven-second response against the former short deadlines, preserve unavailable responses, and confirm failure at the bounded browser deadline without retry. The healthy-response regression failed before this change. The complete regression suite, production build, release checks, and deployed browser verification are required for completion. Broad production QA has shown intermittent upstream timeouts during this build, so its current result must be reported separately from release and browser checks.
