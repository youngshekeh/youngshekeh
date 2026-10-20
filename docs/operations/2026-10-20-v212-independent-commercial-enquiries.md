# V212 Commercial research enquiries and database-independent access

Date: 2026-10-20. Production target: https://thefatheranalytics.com.

## Purpose
The underlying PostgREST gateway still experiences PGRST002 and 57014 schema cache timeouts. Authenticated private kernel operations are not certified stable, and public paid checkout is deliberately hard-locked after its server-side release was blocked.
V212 creates a useful public commercial entry that does not require PostgREST, Supabase Auth or Flutterwave: a self-contained structured research enquiry that prepares an email on the customer's own device.

## Customer workflow
- Reach /research from the homepage, public pricing page or access gateway.
- Pick an existing research domain (Global Macro & Market Research, Nigeria & Africa Economy Intelligence, Custom Data Analysis & Reporting, Enterprise Decision Intelligence, Membership or Licensing).
- Add a contact name, reply email, research question, optional organization, market focus, timeline, indicative budget and context.
- Client-only input validation assembles a clear brief with scope, deliverables and quotation request. No form POST or server-side storage occurs.
- Click Open email application to hand off to the customer's configured email client, then the customer must press Send. If the generated mailto link is too long, copy the full brief into an email manually.
- All email-related language must disclose: preparing an enquiry does NOT mean it was sent or received.
- No payment processing, account grant, trading, pricing promise, delivery SLA or guaranteed returns.

## Evidence from diagnosis
- The three configured PostgREST schemas public, graphql_public and extensions were observed present. The authenticator role has statement_timeout=25s and lock_timeout=8s at the last read.
- pg_stat_statements shows many recursive schema-inspection queries with high aggregate latency, but this does not prove a single root cause. No DDL/pg_cron maintenance is executed in V212.
- Supabase REST remains a launch blocker; investigate PGRST002 reload frequency, latency and connection startup with provider support if the incident persists.

## Safety and acceptance
- Existing V211 checkout hard lock, WAIT / 0R, native scheduler, capital firewalls and authenticated owner flow are unchanged.
- The research brief is not stored by the platform, and no third party receives it until the user explicitly sends an email.
- Test form required fields, header sanitation, bounded content lengths, no network calls in the form controller, and every route in the Vite bundle.
- Verify the custom domain serves /research, homepage and pricing links point to it, sitemap includes it, checkout remains noindex and payment remains on hold.
- Response, service feasibility, confidentiality, pricing and delivery terms are not automated and must be agreed directly before billing.

## Rollback
Revert the scoped V212 frontend/SEO changes with a CI-verified production commit. No database migration, background job or payment service rollback required.