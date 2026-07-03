import crypto from "crypto";
import { kvSet } from "../../lib/kv";
import { sendShareEmail } from "../../lib/mailer";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { videoId, videoTitle, email, hours } = req.body;

    // 🔍 Validate input
    if (!videoId || !email) {
      return res.status(400).json({
        error: "videoId and email are required",
      });
    }

    console.log("📥 Share request:", { videoId, email, hours });

    const token = crypto.randomBytes(16).toString("hex");

    const expiresAt =
      Date.now() + (Number(hours) || 72) * 3600 * 1000;

    const record = {
      token,
      videoId,
      videoTitle: videoTitle || videoId,
      email,
      createdAt: Date.now(),
      expiresAt,
      revoked: false,
    };

    // 💾 Save share record
    await kvSet(`bunnyshare:share:${token}`, record);

    const siteUrl =
      process.env.SITE_URL || `http://${req.headers.host}`;

    const link = `${siteUrl}/watch/${token}`;

    console.log("🔗 Generated link:", link);

    // 📧 Send email (critical section)
    await sendShareEmail({
      to: email,
      videoTitle: record.videoTitle,
      link,
      expiresAt,
    });

    return res.status(200).json({
      ok: true,
      link,
    });

  } catch (err) {
    console.error("❌ SHARE API ERROR:");
    console.error(err);

    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
