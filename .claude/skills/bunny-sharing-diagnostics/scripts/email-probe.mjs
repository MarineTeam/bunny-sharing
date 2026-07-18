#!/usr/bin/env node
// email-probe.mjs — sends ONE test email through the app's real mail path
// (lib/mailer.js sendShareEmail, which routes via deliver(): Resend API if
// RESEND_API_KEY is set, else SMTP). Run from repo root:
//   node .claude/skills/bunny-sharing-diagnostics/scripts/email-probe.mjs --to you@example.com
// Refuses to run without an explicit --to. Source .env.local first.

const args = process.argv.slice(2);
const toIdx = args.indexOf("--to");
const to = toIdx !== -1 ? args[toIdx + 1] : null;

if (!to || !to.includes("@")) {
  console.error("Usage: email-probe.mjs --to <recipient@example.com>   (refusing to send without an explicit --to)");
  process.exit(2);
}

const path = process.env.RESEND_API_KEY ? "Resend HTTP API" : "SMTP (nodemailer)";
console.log(`[info] deliver() path that will be used: ${path}`);
if (!process.env.RESEND_API_KEY) {
  const missing = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"].filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(`MISSING ENV for SMTP path: ${missing.join(", ")} (and RESEND_API_KEY is unset, so the Resend path is unavailable).`);
    process.exit(2);
  }
} else if (!process.env.RESEND_FROM && !process.env.SMTP_FROM && !process.env.SMTP_USER) {
  console.error("MISSING ENV: no from-address available (RESEND_FROM, SMTP_FROM, and SMTP_USER all unset).");
  process.exit(2);
}

const mailerUrl = new URL("../../../../lib/mailer.js", import.meta.url);
const { sendShareEmail } = await import(mailerUrl);

try {
  await sendShareEmail({
    to,
    videoTitle: "diagnostics email-probe test",
    link: "https://example.com/watch/diagnostics-probe",
    expiresAt: Date.now() + 3600 * 1000,
  });
  console.log(`PASS — email accepted by the ${path} for delivery to ${to}. Check the inbox (and spam folder).`);
  process.exit(0);
} catch (err) {
  console.error(`FAIL — ${err.message}`);
  console.error(
    "Interpretation: 'Resend API error: …domain…' = from-address domain not verified in Resend; " +
      "SMTP auth/connection errors = wrong SMTP_HOST/PORT/USER/PASS or STARTTLS/465 mismatch (see email-delivery-reference)."
  );
  process.exit(1);
}
