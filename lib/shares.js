import crypto from "crypto";
import { kvSet } from "./kv";

// Public base URL used when building share links.
export function baseUrl(req) {
  return process.env.SITE_URL || `https://${req.headers.host}`;
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
