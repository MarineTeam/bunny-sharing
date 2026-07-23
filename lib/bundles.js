import crypto from "crypto";
import { kvGet, kvSet, kvSadd, kvSmembers } from "./kv";
import { normalizeEmail } from "./gate";
import { SHARE_INDEX_KEY } from "./shares";

// A Redis SET of every live bundle id, same purpose and pattern as
// SHARE_INDEX_KEY (lib/shares.js) — lets callers list bundles via SMEMBERS
// instead of a full-keyspace KEYS scan.
export const BUNDLE_INDEX_KEY = "bunnybundle-index";

// Every bunnyshare:<token> currently known, via the index rather than a
// KEYS scan (pages/api/backfill-index.js is the one place that still does
// a real KEYS scan, to populate this index from records older than it).
async function allShareRecords() {
  const tokens = await kvSmembers(SHARE_INDEX_KEY);
  const records = await Promise.all(tokens.map((t) => kvGet(`bunnyshare:${t}`)));
  return tokens.map((token, i) => ({ key: `bunnyshare:${token}`, record: records[i] }));
}

// Every bunnybundle:<id> currently known, via the index.
async function allBundleRecords() {
  const ids = await kvSmembers(BUNDLE_INDEX_KEY);
  const records = await Promise.all(ids.map((id) => kvGet(`bunnybundle:${id}`)));
  return ids.map((id, i) => ({ key: `bunnybundle:${id}`, record: records[i] }));
}

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

  // Best-effort, same reasoning as createShareRecord (lib/shares.js): never
  // let an index-write hiccup block bundle creation, which has already
  // succeeded by this point.
  try {
    await kvSadd(BUNDLE_INDEX_KEY, id);
  } catch (err) {
    console.error("Failed to index new bundle id (non-fatal):", err);
  }

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

// { videoTitle, link } for every currently-active member — the shape both
// sendShareEmail's multi-item sibling (sendBulkShareEmail) and a fresh bundle
// listing need. Revoked/expired members are dropped, same filter the bundle
// page itself applies.
export async function getBundleItems(tokens, siteUrl) {
  const members = await getBundleMembers(tokens);
  return members
    .filter(({ record }) => record && !record.revoked && Date.now() < record.expiresAt)
    .map(({ token, record }) => ({ videoTitle: record.videoTitle, link: `${siteUrl}/watch/${token}` }));
}

// Finds an existing, still-active bundle for this email and extends it with
// the given members' tokens, instead of creating a second bundle for the
// same person — so shares created across separate admin actions (single or
// bulk, today or next week) still land the recipient on ONE bundle page,
// and the notification for each new share can be folded into the same place
// rather than becoming yet another standalone email.
//
// If no active bundle exists yet, this also folds in any OTHER still-active
// bunnyshare records for this email that aren't already part of some bundle
// (e.g. single-video shares made before bundles existed, or before this
// recipient's first bulk share) — so the first bundle created for someone
// reflects everything currently shared with them, not just what's new.
export async function findOrExtendBundle({ email, members, siteUrl }) {
  const target = normalizeEmail(email);
  const bundleEntries = await allBundleRecords();
  const bundles = bundleEntries.map((e) => e.record);
  const existing = bundles.find(
    (b) => b && normalizeEmail(b.email) === target && Date.now() < b.expiresAt
  );

  if (existing) {
    const tokens = [...new Set([...existing.tokens, ...members.map((m) => m.token)])];
    const expiresAt = Math.max(existing.expiresAt, ...members.map((m) => m.expiresAt));
    const merged = { ...existing, tokens, expiresAt };
    await kvSet(`bunnybundle:${existing.id}`, merged);
    return { record: merged, link: `${siteUrl}/bundle/${existing.id}` };
  }

  const alreadyBundled = new Set(bundles.flatMap((b) => (b ? b.tokens : [])));
  const newTokens = new Set(members.map((m) => m.token));
  const shareEntries = await allShareRecords();
  const orphanMembers = shareEntries
    .map((e) => e.record)
    .filter(
      (r) =>
        r &&
        !r.revoked &&
        Date.now() < r.expiresAt &&
        normalizeEmail(r.email) === target &&
        !alreadyBundled.has(r.token) &&
        !newTokens.has(r.token)
    )
    .map((r) => ({ token: r.token, expiresAt: r.expiresAt }));

  return createBundleRecord({ email, members: [...members, ...orphanMembers], siteUrl });
}

// Maps each of `tokens` to its bundle's `/bundle/<id>` link (only those that
// belong to one), doing a single bundle scan for the whole list rather than
// one scan per token. Used by the admin shares listing so every row can show
// a persistent "Bundle" link instead of that link only ever surfacing once,
// in the share/bulk-share success toast.
export async function bundleLinksForTokens(tokens, siteUrl) {
  const bundles = (await allBundleRecords()).map((e) => e.record);

  const tokenToLink = new Map();
  for (const b of bundles) {
    if (!b) continue;
    for (const t of b.tokens) tokenToLink.set(t, `${siteUrl}/bundle/${b.id}`);
  }

  const result = {};
  for (const t of tokens) {
    if (tokenToLink.has(t)) result[t] = tokenToLink.get(t);
  }
  return result;
}

// If `token` belongs to some bundle, extends that bundle's expiresAt to
// `newExpiresAt` (never shrinks it). Used when a single share's own expiry
// is extended, so the bundle listing it belongs to doesn't expire before a
// member that now legitimately outlives it. No-op if the token isn't in any
// bundle, or if the bundle's expiresAt is already later.
export async function extendBundleForToken(token, newExpiresAt) {
  const bundles = (await allBundleRecords()).map((e) => e.record);
  const bundle = bundles.find((b) => b && b.tokens.includes(token));
  if (!bundle || newExpiresAt <= bundle.expiresAt) return null;

  const updated = { ...bundle, expiresAt: newExpiresAt };
  await kvSet(`bunnybundle:${bundle.id}`, updated);
  return updated;
}
