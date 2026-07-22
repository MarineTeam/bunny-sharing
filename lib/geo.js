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
export function isGeoAllowed(req, whitelist) {
  if (!whitelist || whitelist.length === 0) return true;
  const country = req.headers["x-vercel-ip-country"];
  if (!country) return true;
  return whitelist.includes(String(country).toUpperCase());
}
