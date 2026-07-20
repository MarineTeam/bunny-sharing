import { createShareRecord, baseUrl, parseEmails } from "../../lib/shares";
import { sendShareEmail } from "../../lib/mailer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { videoId, videoTitle, email, hours } = req.body;
    const recipients = parseEmails(email);
    if (!videoId || recipients.length === 0) {
      return res.status(400).json({ error: "videoId and email are required" });
    }

    // A comma-separated email field fans out: one record + one email per
    // recipient, so each gets their own link and can pass the email gate.
    const siteUrl = baseUrl(req);
    const links = [];
    for (const to of recipients) {
      const { record, link } = await createShareRecord({
        videoId,
        videoTitle,
        email: to,
        hours,
        siteUrl,
      });

      await sendShareEmail({
        to,
        videoTitle: record.videoTitle,
        link,
        expiresAt: record.expiresAt,
      });
      links.push({ email: to, link });
    }

    res.status(200).json({ ok: true, link: links[0].link, links });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
