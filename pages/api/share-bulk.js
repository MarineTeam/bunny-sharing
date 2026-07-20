import { createShareRecord, setEmailFailed, baseUrl, parseEmails } from "../../lib/shares";
import { sendBulkShareEmail } from "../../lib/mailer";

// Creates a separate share (distinct token + link) for every recipient x video
// pair and emails each recipient one message listing only THEIR links. Every
// pair gets its own record on purpose: access is revocable per person per
// video, and views are tracked per person (see /watch/[token]).
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { videos, emails, email, hours } = req.body;
    // parseEmails splits comma/semicolon/whitespace-joined strings in BOTH
    // shapes — a legacy client sending email:"a@b.c, d@e.f" must fan out to
    // two recipients, never become one record with a combined email string.
    const recipients = parseEmails(emails ?? email);

    if (!Array.isArray(videos) || videos.length === 0 || recipients.length === 0) {
      return res
        .status(400)
        .json({ error: "videos (non-empty array) and emails (at least one) are required" });
    }

    const siteUrl = baseUrl(req);
    const results = [];
    const failures = [];

    for (const to of recipients) {
      const created = [];
      for (const v of videos) {
        const videoId = v && v.id;
        if (!videoId) continue;
        const { record, link } = await createShareRecord({
          videoId,
          videoTitle: v.title,
          email: to,
          hours,
          siteUrl,
        });
        created.push({ token: record.token, videoId, videoTitle: record.videoTitle, link, expiresAt: record.expiresAt });
      }
      if (created.length === 0) {
        return res.status(400).json({ error: "No valid videos to share" });
      }

      try {
        await sendBulkShareEmail({
          to,
          items: created.map((c) => ({ videoTitle: c.videoTitle, link: c.link })),
          expiresAt: Math.max(...created.map((c) => c.expiresAt)),
        });
        results.push({ email: to, links: created.map((c) => ({ videoId: c.videoId, link: c.link })) });
      } catch (err) {
        // Records exist but this recipient's email failed — flag each one so
        // they aren't silent ghosts in the admin table (persists past reload,
        // unlike the one-time failures array below), and report it rather
        // than failing the whole batch (other recipients may have succeeded).
        await Promise.all(created.map((c) => setEmailFailed(c.token, true, err.message)));
        failures.push({ email: to, error: err.message });
      }
    }

    if (results.length === 0) {
      return res.status(500).json({ error: `All emails failed: ${failures.map((f) => f.error).join("; ")}` });
    }

    res.status(200).json({
      ok: true,
      count: results.reduce((n, r) => n + r.links.length, 0),
      recipients: results,
      ...(failures.length > 0 && { failures }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
