## v1.4.0

Geo location whitelisting, for both recipient pages and the admin surface
itself. All additive — existing share tokens, `/watch` links, gate cookies,
and KV records keep working unchanged.

### Added
- **Geo location whitelists (recipient + admin), both env-var-based.** Two
  independent country whitelists, same design: `/watch` and `/bundle` pages
  can be restricted via `GEO_WHITELIST`; the admin page and its API routes
  can be restricted via `ADMIN_GEO_WHITELIST`, on top of Basic Auth. Both
  lists live ONLY in env vars, never in the admin-editable Settings
  record — the Settings panel just has an ON/OFF toggle for each (off by
  default) and a read-only display of what's configured, so a bad list is
  always recoverable from the hosting dashboard, never trapped behind a
  page it's blocking. Detected via Vercel's edge network
  (`x-vercel-ip-country`); both fail open (never block) when that header
  is absent, so a non-Vercel deployment or local dev is simply
  unrestricted rather than silently locked out. A coarse IP-geolocation
  signal, not identity verification — complements the email gate/admin
  credentials rather than replacing them.

**Full Changelog**: https://github.com/MarineTeam/bunny-sharing/compare/v1.3.0...v1.4.0
