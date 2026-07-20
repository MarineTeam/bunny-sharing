import { createShareRecord, setEmailFailed, baseUrl, parseEmails } from "../../lib/shares";
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
    const failures = [];
    for (const to of recipients) {
      const { record, link } = await createShareRecord({
        videoId,
        videoTitle,
        email: to,
        hours,
        siteUrl,
      });

      try {
        await sendShareEmail({
          to,
          videoTitle: record.videoTitle,
          link,
          expiresAt: record.expiresAt,
        });
        links.push({ email: to, link });
      } catch (err) {
        // The record exists (link is live) even though the notification
        // failed — flag it so it isn't a silent ghost in the admin table,
        // and report the failure instead of 500ing the whole batch.
        await setEmailFailed(record.token, true, err.message);
        failures.push({ email: to, link, error: err.message });
      }
    }

    if (links.length === 0) {
      return res.status(500).json({ error: `All emails failed: ${failures.map((f) => f.error).join("; ")}` });
    }

    res.status(200).json({
      ok: true,
      link: links[0].link,
      links,
      ...(failures.length > 0 && { failures }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
