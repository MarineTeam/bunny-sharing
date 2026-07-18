import { createShareRecord, baseUrl } from "../../lib/shares";
import { sendBulkShareEmail } from "../../lib/mailer";

// Creates a separate share (distinct token + link) for each selected video and
// emails the recipient one message listing all of them. Each video gets its own
// link on purpose — they can be revoked independently and never collide.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { videos, email, hours } = req.body;
    if (!Array.isArray(videos) || videos.length === 0 || !email) {
      return res
        .status(400)
        .json({ error: "videos (non-empty array) and email are required" });
    }

    const siteUrl = baseUrl(req);
    const created = [];

    for (const v of videos) {
      const videoId = v && v.id;
      if (!videoId) continue;
      const { record, link } = await createShareRecord({
        videoId,
        videoTitle: v.title,
        email,
        hours,
        siteUrl,
      });
      created.push({ videoId, videoTitle: record.videoTitle, link, token: record.token, expiresAt: record.expiresAt });
    }

    if (created.length === 0) {
      return res.status(400).json({ error: "No valid videos to share" });
    }

    await sendBulkShareEmail({
      to: email,
      items: created.map((c) => ({ videoTitle: c.videoTitle, link: c.link })),
      expiresAt: Math.max(...created.map((c) => c.expiresAt)),
    });

    res.status(200).json({ ok: true, count: created.length, links: created.map((c) => ({ videoId: c.videoId, link: c.link })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
