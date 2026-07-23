// Restricts recipient-facing pages (/watch, /bundle) and the admin surface
// to whitelists of countries, using the `x-vercel-ip-country` header
// Vercel's edge network adds to every request (both serverless and edge
// functions) — the app's documented target deploy platform (see README).
//
// BOTH whitelists' country lists live ONLY in env vars (GEO_WHITELIST /
// ADMIN_GEO_WHITELIST), never in the admin-editable KV settings — on
// purpose. If a wrong list ever locks people out (recipients OR the admin),
// recovery must not depend on reaching a page that same list is blocking.
// Fixing it means editing the env var in your hosting dashboard and
// redeploying, a surface this app's own gate can never touch. The Settings
// panel only carries runtime ON/OFF toggles (lib/settings.js:
// geoWhitelistEnabled / adminGeoWhitelistEnabled) so enforcement can be
// flipped without a redeploy, plus a read-only display of what each env var
// currently holds — it can never edit either list.
//
// Both fail OPEN when the country header is absent (local dev, or any
// non-Vercel host): a deployment that isn't on Vercel is simply
// unrestricted rather than silently locked out. Like the watermark, this is
// a coarse, IP-geolocation-database signal, not a hard security boundary —
// a VPN or proxy defeats it. It's coarse access control, not identity
// verification (that's still the email gate / admin credentials).
function countryAllowed(country, whitelist) {
  if (!whitelist || whitelist.length === 0) return true;
  if (!country) return true;
  return whitelist.includes(String(country).toUpperCase());
}

function parseWhitelist(envValue) {
  return String(envValue || "")
    .split(/[,;\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}

// Node-style request (plain headers object) — used by pages/watch/[token].js
// and pages/bundle/[bundleId].js's getServerSideProps.
export function isGeoAllowed(req, whitelist) {
  return countryAllowed(req.headers["x-vercel-ip-country"], whitelist);
}

// Edge-style request (Web Headers, .get()) — used by middleware.js.
export function isGeoAllowedEdge(req, whitelist) {
  return countryAllowed(req.headers.get("x-vercel-ip-country"), whitelist);
}

// Recipient-facing whitelist (/watch, /bundle). See GEO_WHITELIST in
// .env.example.
export function recipientGeoWhitelist() {
  return parseWhitelist(process.env.GEO_WHITELIST);
}

// Admin-surface whitelist (/ and its /api/* routes). See ADMIN_GEO_WHITELIST
// in .env.example.
export function adminGeoWhitelist() {
  return parseWhitelist(process.env.ADMIN_GEO_WHITELIST);
}

// Admin usernames (matched case-insensitively against the Basic Auth
// username that just authenticated) that always skip the admin geo check,
// regardless of country or the enforcement toggle. Sourced from
// ADMIN_GEO_BYPASS_EMAILS — an env var, not Settings, for the same reason
// as the whitelists themselves: it has to stay editable outside the app so
// it works as a pre-armed safety net. Arm it BEFORE traveling — env var
// changes need a redeploy, so this is not an in-the-moment fix if you're
// already locked out, only a standing exemption set up in advance.
export function adminGeoBypassEmails() {
  return String(process.env.ADMIN_GEO_BYPASS_EMAILS || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
