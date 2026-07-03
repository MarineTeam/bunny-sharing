import nodemailer from "nodemailer";

export async function sendShareEmail({ to, videoTitle, link, expiresAt }) {
  // 🔐 Basic env validation (fail fast)
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Missing SMTP environment variables");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    // 🧪 Test connection BEFORE sending
    await transporter.verify();
    console.log("✅ SMTP connection verified");

    const expiresDate = new Date(expiresAt).toLocaleString();

    const info = await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject: `You've been granted access to "${videoTitle}"`,
      text: `You can watch "${videoTitle}" here:\n\n${link}\n\nThis link expires on ${expiresDate}`,
      html: `
        <p>You can watch <strong>${videoTitle}</strong> using the link below:</p>
        <p><a href="${link}">${link}</a></p>
        <p><b>Expires:</b> ${expiresDate}</p>
      `,
    });

    console.log("📧 Email sent successfully");
    console.log("Message ID:", info.messageId);
    console.log("Accepted:", info.accepted);
    console.log("Rejected:", info.rejected);

    return info;
  } catch (err) {
    console.error("❌ MAILER ERROR:");
    console.error(err);

    throw new Error(`SMTP send failed: ${err.message}`);
  }
}
