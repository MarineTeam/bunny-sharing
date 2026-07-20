import { kvGet } from "../../../lib/kv";
import { setEmailFailed, baseUrl } from "../../../lib/shares";
import { sendShareEmail } from "../../../lib/mailer";

// Admin-only (covered by the default middleware matcher, unlike /api/watch/*).
// Re-sends the notification for one existing share record — used after a
// send failure left a live link with emailFailed: true. Resends as a plain
// single-link email regardless of whether the record was created via bulk
// share; the recipient just needs to be told the link exists.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: "token is required" });

    const record = await kvGet(`bunnyshare:${token}`);
    if (!record) return res.status(404).json({ error: "Share not found" });
    if (record.revoked || Date.now() > record.expiresAt) {
      return res.status(400).json({ error: "Share is revoked or expired" });
    }

    const link = `${baseUrl(req)}/watch/${token}`;
    try {
      await sendShareEmail({
        to: record.email,
        videoTitle: record.videoTitle,
        link,
        expiresAt: record.expiresAt,
      });
      await setEmailFailed(token, false);
      res.status(200).json({ ok: true });
    } catch (err) {
      await setEmailFailed(token, true, err.message);
      res.status(502).json({ error: err.message });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
