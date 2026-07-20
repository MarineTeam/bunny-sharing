import nodemailer from "nodemailer";
import { Resend } from "resend";

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return String(text).replace(/[&<>"']/g, (char) => map[char]);
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function fromAddress() {
  return process.env.RESEND_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
}

// Single delivery path for every email in this app. Uses the Resend HTTP API
// when RESEND_API_KEY is set (the native, recommended way to use Resend), and
// otherwise falls back to plain SMTP via nodemailer so any other provider still
// works. Callers only build { to, subject, text, html }.
async function deliver({ to, subject, text, html }) {
  const from = fromAddress();

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from, to, subject, text, html });
    if (error) {
      throw new Error(`Resend API error: ${error.message || JSON.stringify(error)}`);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  await transporter.sendMail({ from, to, subject, text, html });
}

export async function sendShareEmail({ to, videoTitle, link, expiresAt }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
  }

  const expiresDate = new Date(expiresAt).toLocaleString();
  const escapedTitle = escapeHtml(videoTitle);
  const escapedLink = escapeHtml(link);
  const escapedDate = escapeHtml(expiresDate);

  await deliver({
    to,
    subject: `You've been granted access to "${escapedTitle}"`,
    text: `You can watch "${videoTitle}" here:\n\n${link}\n\nThis link expires on ${expiresDate} and may be revoked at any time.`,
    html: `<p>You can watch <strong>${escapedTitle}</strong> using the link below:</p>
           <p><a href="${escapedLink}">${escapedLink}</a></p>
           <p>This link expires on ${escapedDate} and may be revoked at any time.</p>`,
  });
}

// Sends one consolidated email listing several share links, one per video.
// Each item is { videoTitle, link } and carries its own distinct token.
// `bundleLink`, if given and valid, adds a single link to a listing page for
// all of them (see lib/bundles.js) — purely additive to the email body.
export async function sendBulkShareEmail({ to, items, expiresAt, bundleLink }) {
  const safeItems = items.filter((i) => isValidUrl(i.link));
  if (safeItems.length === 0) {
    throw new Error("No valid link URLs");
  }

  const expiresDate = new Date(expiresAt).toLocaleString();
  const escapedDate = escapeHtml(expiresDate);
  const validBundleLink = bundleLink && isValidUrl(bundleLink) ? bundleLink : null;
  const escapedBundleLink = validBundleLink ? escapeHtml(validBundleLink) : null;

  const textLines = safeItems.map((i) => `${i.videoTitle}:\n${i.link}`).join("\n\n");
  const htmlItems = safeItems
    .map(
      (i) =>
        `<li><strong>${escapeHtml(i.videoTitle)}</strong><br/>` +
        `<a href="${escapeHtml(i.link)}">${escapeHtml(i.link)}</a></li>`
    )
    .join("");

  await deliver({
    to,
    subject: `You've been granted access to ${safeItems.length} video${safeItems.length !== 1 ? "s" : ""}`,
    text: `You've been granted access to the following videos. Each has its own link:\n\n${textLines}\n\n${validBundleLink ? `Or view them all in one place:\n${validBundleLink}\n\n` : ""}These links expire on ${expiresDate} and may be revoked at any time.`,
    html: `<p>You've been granted access to the following videos. Each has its own link:</p>
           <ul>${htmlItems}</ul>
           ${validBundleLink ? `<p>Or <a href="${escapedBundleLink}">view them all in one place</a>.</p>` : ""}
           <p>These links expire on ${escapedDate} and may be revoked at any time.</p>`,
  });
}

// Sends the "magic link" that a recipient clicks after entering the matching
// email on the /watch page. The link carries a short-lived signed grant.
export async function sendMagicLinkEmail({ to, videoTitle, link }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
  }

  const escapedTitle = escapeHtml(videoTitle);
  const escapedLink = escapeHtml(link);

  await deliver({
    to,
    subject: `Your sign-in link for "${escapedTitle}"`,
    text: `Use the link below to watch "${videoTitle}". It confirms it's really you and expires shortly:\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Use the link below to watch <strong>${escapedTitle}</strong>. It confirms it's really you and expires shortly:</p>
           <p><a href="${escapedLink}">Watch "${escapedTitle}"</a></p>
           <p>If you didn't request this, you can ignore this email.</p>`,
  });
}

// Sends the "magic link" for a bundle listing page (lib/bundles.js) rather
// than a single video — same mechanism as sendMagicLinkEmail, generic wording
// since there's no single title to name.
export async function sendBundleMagicLinkEmail({ to, link }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
  }

  const escapedLink = escapeHtml(link);

  await deliver({
    to,
    subject: `Your sign-in link for your shared videos`,
    text: `Use the link below to view your shared videos. It confirms it's really you and expires shortly:\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Use the link below to view your shared videos. It confirms it's really you and expires shortly:</p>
           <p><a href="${escapedLink}">View your videos</a></p>
           <p>If you didn't request this, you can ignore this email.</p>`,
  });
}
