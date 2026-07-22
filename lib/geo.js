// Restricts recipient-facing pages (/watch, /bundle) to a whitelist of
// countries, using the `x-vercel-ip-country` header Vercel's edge network
// adds to every request (both serverless and edge functions) — the app's
// documented target deploy platform (see README). Off by default: an empty
// whitelist means no restriction, so a deployment that never sets this
// behaves exactly as it did before this existed.
//
// Fails OPEN when the header is absent (local dev, or any non-Vercel host):
// an admin who turns this on but deploys elsewhere would otherwise silently
// lock out every recipient with no way to tell why. Like the watermark, this
// is a coarse, IP-geolocation-database signal, not a hard security boundary
// — a VPN or proxy defeats it. It's a coarse access control, not identity
// verification (that's still the email gate).
function countryAllowed(country, whitelist) {
  if (!whitelist || whitelist.length === 0) return true;
  if (!country) return true;
  return whitelist.includes(String(country).toUpperCase());
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

// The admin-surface whitelist is sourced from an ENV VAR, never from the
// runtime KV settings an admin edits in-app — on purpose. If enabling this
// ever locks an admin out, the recovery path must not depend on reaching
// the very page it's protecting. Edit/remove ADMIN_GEO_WHITELIST in your
// hosting provider's dashboard (e.g. Vercel's project settings) and
// redeploy — a surface this app's own gate can never block, since it isn't
// served by this app. The Settings panel only carries a runtime ON/OFF
// toggle (lib/settings.js: adminGeoWhitelistEnabled) for enforcement, and
// shows this list read-only; it can never edit the list itself.
export function adminGeoWhitelist() {
  return String(process.env.ADMIN_GEO_WHITELIST || "")
    .split(/[,;\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c));
}
