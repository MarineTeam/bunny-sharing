import { createShareRecord, baseUrl } from "../../lib/shares";
import { sendShareEmail } from "../../lib/mailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { videoId, videoTitle, email, hours } = req.body;
    if (!videoId || !email) {
      return res.status(400).json({ error: "videoId and email are required" });
    }

    const { record, link } = await createShareRecord({
      videoId,
      videoTitle,
      email,
      hours,
      siteUrl: baseUrl(req),
    });

    await sendShareEmail({
      to: email,
      videoTitle: record.videoTitle,
      link,
      expiresAt: record.expiresAt,
    });

    res.status(200).json({ ok: true, link });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
