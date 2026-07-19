import crypto from "crypto";
import { kvSet } from "./kv";

// Public base URL used when building share links.
export function baseUrl(req) {
  return process.env.SITE_URL || `https://${req.headers.host}`;
}

// Parses one-or-many recipient emails from a string or array, splitting on
// commas/semicolons/whitespace INSIDE each element too. This is the single
// place that turns user input into a recipient list — a comma-joined string
// must never survive into a share record's `email` field (records stored
// with combined strings can never pass the email gate).
export function parseEmails(input) {
  const list = (Array.isArray(input) ? input : [input]).flatMap((e) =>
    String(e || "").split(/[,;\s]+/)
  );
  return [...new Set(list.map((e) => e.trim()).filter((e) => e.includes("@")))];
}

// Creates a single share record with its own unguessable token and stores it.
// Returns the stored record plus the recipient-facing /watch link. Each call
// generates a fresh random token, so N calls always produce N distinct links.
export async function createShareRecord({ videoId, videoTitle, email, hours, siteUrl }) {
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = Date.now() + (Number(hours) || 72) * 3600 * 1000;

  const record = {
    token,
    videoId,
    videoTitle: videoTitle || videoId,
    email,
    createdAt: Date.now(),
    expiresAt,
    revoked: false,
  };

  await kvSet(`bunnyshare:${token}`, record);

  const link = `${siteUrl}/watch/${token}`;
  return { record, link };
}
