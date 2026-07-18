import nodemailer from "nodemailer";

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

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendShareEmail({ to, videoTitle, link, expiresAt }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
  }
  const transporter = createTransport();

  const expiresDate = new Date(expiresAt).toLocaleString();
  const escapedTitle = escapeHtml(videoTitle);
  const escapedLink = escapeHtml(link);
  const escapedDate = escapeHtml(expiresDate);

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
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
export async function sendBulkShareEmail({ to, items, expiresAt }) {
  const safeItems = items.filter((i) => isValidUrl(i.link));
  if (safeItems.length === 0) {
    throw new Error("No valid link URLs");
  }
  const transporter = createTransport();

  const expiresDate = new Date(expiresAt).toLocaleString();
  const escapedDate = escapeHtml(expiresDate);

  const textLines = safeItems.map((i) => `${i.videoTitle}:\n${i.link}`).join("\n\n");
  const htmlItems = safeItems
    .map(
      (i) =>
        `<li><strong>${escapeHtml(i.videoTitle)}</strong><br/>` +
        `<a href="${escapeHtml(i.link)}">${escapeHtml(i.link)}</a></li>`
    )
    .join("");

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `You've been granted access to ${safeItems.length} video${safeItems.length !== 1 ? "s" : ""}`,
    text: `You've been granted access to the following videos. Each has its own link:\n\n${textLines}\n\nThese links expire on ${expiresDate} and may be revoked at any time.`,
    html: `<p>You've been granted access to the following videos. Each has its own link:</p>
           <ul>${htmlItems}</ul>
           <p>These links expire on ${escapedDate} and may be revoked at any time.</p>`,
  });
}

// Sends the "magic link" that a recipient clicks after entering the matching
// email on the /watch page. The link carries a short-lived signed grant.
export async function sendMagicLinkEmail({ to, videoTitle, link }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
  }
  const transporter = createTransport();

  const escapedTitle = escapeHtml(videoTitle);
  const escapedLink = escapeHtml(link);

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `Your sign-in link for "${escapedTitle}"`,
    text: `Use the link below to watch "${videoTitle}". It confirms it's really you and expires shortly:\n\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    html: `<p>Use the link below to watch <strong>${escapedTitle}</strong>. It confirms it's really you and expires shortly:</p>
           <p><a href="${escapedLink}">Watch "${escapedTitle}"</a></p>
           <p>If you didn't request this, you can ignore this email.</p>`,
  });
}
