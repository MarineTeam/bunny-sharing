import crypto from "crypto";
import { kvSet } from "../../lib/kv";
import { sendShareEmail } from "../../lib/mailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { videoId, videoTitle, email, hours } = req.body;
    if (!videoId || !email) {
      return res.status(400).json({ error: "videoId and email are required" });
    }

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = Date.now() + (Number(hours) || 72) * 3600 * 1000;

    const record = {
      token,
      videoId,
      videoTitle: videoTitle || videoId,
      email,
      createdAt: Date.now(),
      expiresAt,
      revoked: false,
    };

    await kvSet(`share:${token}`, record);

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
    const link = `${siteUrl}/watch/${token}`;

    await sendShareEmail({
      to: email,
      videoTitle: record.videoTitle,
      link,
      expiresAt,
    });

    res.status(200).json({ ok: true, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
