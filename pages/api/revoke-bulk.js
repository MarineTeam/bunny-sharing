import { revokeOne } from "./revoke";

// Admin-only (covered by the default middleware matcher). Revokes multiple
// shares in one call — never fails the whole batch; each token's outcome is
// reported independently, same pattern as /api/share/resend-bulk and
// /api/share/extend-bulk.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { tokens } = req.body || {};
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ error: "tokens (non-empty array) is required" });
    }

    const results = await Promise.all(tokens.map((token) => revokeOne(token)));

    res.status(200).json({
      ok: true,
      succeeded: results.filter((r) => r.ok).map((r) => r.token),
      failures: results.filter((r) => !r.ok),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
