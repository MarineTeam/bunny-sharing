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

export async function sendShareEmail({ to, videoTitle, link, expiresAt }) {
  if (!isValidUrl(link)) {
    throw new Error("Invalid link URL");
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
