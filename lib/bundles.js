import crypto from "crypto";
import { kvGet, kvSet } from "./kv";

// A bundle groups the tokens created by one /api/share-bulk call for one
// recipient, so they can view everything shared with them from a single
// gated page. The bundle record is PURELY a grouping list — it is never a
// second source of truth. Per-video status (revoked/expired/title) always
// comes live from that video's own bunnyshare:<token> record, so revoking or
// letting one share expire is reflected immediately without touching the
// bundle record itself.
export async function createBundleRecord({ email, members, siteUrl }) {
  const id = crypto.randomBytes(16).toString("hex");
  const record = {
    id,
    email,
    tokens: members.map((m) => m.token),
    createdAt: Date.now(),
    expiresAt: Math.max(...members.map((m) => m.expiresAt)),
  };

  await kvSet(`bunnybundle:${id}`, record);

  const link = `${siteUrl}/bundle/${id}`;
  return { record, link };
}

// Looks up each member token's own share record, live. A token whose record
// is missing (e.g. deleted by cleanup) is returned with record: null so
// callers can skip it rather than crash.
export async function getBundleMembers(tokens) {
  const records = await Promise.all(tokens.map((t) => kvGet(`bunnyshare:${t}`)));
  return tokens.map((token, i) => ({ token, record: records[i] }));
}
