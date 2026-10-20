# V213 SEO static asset packaging fix

20 October 2026 production audit found `/research` and `/pricing` were reachable, but `/sitemap.xml` returned HTTP 404 despite the file existing in the repository root. Vite's production build copies the `public/` directory, not arbitrary root XML/TXT files.

V213 places identical copies of `sitemap.xml` and `robots.txt` under Vite `public/` and adds regression checks against their canonical root counterparts. This exposes the XML sitemap and robots file at the domain root after production deployment. Sitemap includes /research and /pricing; checkout, member and owner routes are excluded/disallowed appropriately.

No database, Supabase, cron, payment function, capital permission, secrets or trading code changed.

After deploy verify both `/sitemap.xml` and `/robots.txt` at the custom domain. If search-engine asset URLs do not return HTTP 200, don't announce the SEO routing repair.

Rollback: revert V213 scoped static copies in a CI-reviewed deployment; this will restore the previous packaging and SEO 404, without affecting customer accounts or payment.