import nodemailer from "nodemailer";

export async function sendShareEmail({ to, videoTitle, link, expiresAt }) {
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

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `You've been granted access to "${videoTitle}"`,
    text: `You can watch "${videoTitle}" here:\n\n${link}\n\nThis link expires on ${expiresDate} and may be revoked at any time.`,
    html: `<p>You can watch <strong>${videoTitle}</strong> using the link below:</p>
           <p><a href="${link}">${link}</a></p>
           <p>This link expires on ${expiresDate} and may be revoked at any time.</p>`,
  });
}
