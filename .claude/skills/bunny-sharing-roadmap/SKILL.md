---
name: bunny-sharing-roadmap
description: >
  The forward-looking register for the bunny-sharing repo: the idea lifecycle
  (proposal → evidence plan → compatibility-safe implementation → certification
  → adoption or documented retirement), the open-problems list with file-level
  first steps and falsifiable "you have a result when" milestones (KEYS→SCAN,
  per-IP rate limiting, admin auth upgrade, Bunny pagination, email-failure
  handling, bundle UX), and honest positioning of what here is standard
  practice vs genuinely nice design. Load this when proposing new work,
  prioritizing improvements, or asking "what should be built next". Do NOT
  load for executing the current gate certification
  (bunny-sharing-email-gate-campaign), understanding the current design
  (bunny-sharing-architecture-contract), or checking whether an idea was
  already tried and rejected (bunny-sharing-failure-archaeology — check it
  BEFORE proposing anything from here).
---

# bunny-sharing roadmap

Scope honesty first: this is a small production utility for sharing private
Bunny Stream videos, not a research project. "Advancing" it means operational
excellence and security posture — nothing here is novel computer science, and
no claim of novelty should ever be made. The value of this register is that
each entry names exact files, first steps, and a falsifiable finish line, so
a zero-context session can pick one up and know when it is actually done.

## 1. The idea lifecycle

1. **Check history.** bunny-sharing-failure-archaeology — if it was tried and
   rejected (Auth0/Clerk, per-send SMTP verify, OTP-first), do not re-open
   without new facts.
2. **Classify.** bunny-sharing-change-control assigns the class and its
   verification bar.
3. **State the prediction BEFORE coding.** Write down the measurable outcome
   ("after this change, X command outputs Y"). No prediction, no
   implementation.
4. **Implement inside compatibility.** The never-break-live-links rule:
   existing tokens, `bunnyshare:*` records, `/watch` URLs, and `gate_<token>`
   cookies keep working. New key namespaces are fine; renaming old ones is
   not.
5. **Certify** at the evidence level the class demands
   (bunny-sharing-validation-and-qa), then adopt — or record the retirement
   and why in failure-archaeology so the next session doesn't re-fight it.

Worked historical example (the email gate itself, 2026-07-18): requirement
("links must be tied to recipient email") → provider evaluation → Auth0/Clerk
rejected with reasons → HMAC magic-link design chosen → crypto self-test
written and passed BEFORE live claims → live certification deliberately left
open and tracked as the campaign. That full arc is the template.

## 2. Open-problems register

Each entry: why insufficient / the asset we have / first three steps in this
repo / "you have a result when…". All are CANDIDATES — none is scheduled work.

### (a) Replace KEYS scans (lib/kv.js)
- **Why:** `kvKeys("bunnyshare:*")` uses Redis KEYS — O(N) over the whole
  keyspace on every admin page load and cleanup run. Fine at ~dozens of
  shares; degrades silently as records grow.
- **Asset:** all writes already funnel through `createShareRecord`
  (lib/shares.js) — one choke point to maintain an index.
- **First steps:** (1) add an index set (SADD `bunnyshare-index` on create;
  SREM on cleanup) via new lib/kv.js helpers; (2) switch pages/api/shares.js
  and cleanup.js to read the index with per-token GETs; (3) one-off backfill
  script that KEYS-scans once and populates the index (old records must keep
  working — lifecycle rule 4).
- **Result when:** with 1,000 seeded records, /api/shares returns correctly
  and no KEYS command is issued (verify via Upstash console/monitor), and
  pre-existing records created before the change still appear.

### (b) Per-IP rate limiting on /api/watch/request-link
- Owned by the campaign's hardening menu item 2 — see
  bunny-sharing-email-gate-campaign for mechanism and validation predicate.
  Listed here only for priority ranking: do it after single-use links.

### (c) Single-use magic links
- Owned by the campaign's hardening menu item 1 (top-ranked). Not duplicated
  here.

### (d) Admin auth upgrade (middleware.js)
- **Why:** single shared credential, plaintext `===` comparison (not
  timing-safe), no lockout. Acceptable for one trusted admin; weak beyond.
- **Asset:** the auth boundary is one small file with a crisp matcher
  invariant.
- **First steps:** (1) minimal: constant-time compare via
  `crypto.timingSafeEqual` on padded buffers in middleware.js (note:
  middleware runs on the Edge runtime — verify `node:crypto` availability
  there first; if unavailable, a WebCrypto HMAC-then-compare achieves the
  same); (2) prediction: auth behavior byte-identical for correct/incorrect
  creds (P2-style diff of 401 responses); (3) only later, if multiple admins
  materialize: named users — a scope change requiring its own design pass.
- **Result when:** compare is constant-time, matcher unchanged
  (`/api/((?!watch/).*)` still excludes recipient endpoints), and the
  validation-and-qa middleware checklist passes untouched.

### (e) Bunny list pagination (lib/bunny.js)
- **Why:** `itemsPerPage=100` with no paging — video #101 silently never
  appears in the admin grid.
- **Asset:** Bunny's list API is already paginated (`page` param,
  `totalItems` in response).
- **First steps:** (1) loop pages in `listVideos()` until `items` is short or
  `totalItems` reached; (2) prediction: a library with >100 videos lists all
  of them; ≤100 behaves identically; (3) consider UI consequences (grid
  length) separately.
- **Result when:** seeded/test library with 101+ videos shows all titles via
  /api/videos (count equals the library's totalItems).

### (f) Email-send failure handling — ADOPTED 2026-07-20
- **Was:** the KV record was written BEFORE the email sends; a mailer
  failure then returned 500 — so a share existed that no one was told
  about (confusing ghost). This is no longer open; kept here as the
  record of what shipped and how it was verified, per lifecycle rule 5.
- **What shipped:** `setEmailFailed(token, failed, errorMessage)`
  (lib/shares.js) sets/clears additive `emailFailed`/`emailError` fields
  (clears via `undefined`, so the key is dropped from JSON rather than
  left `false` — absence means "no known failure"). `pages/api/share.js`
  and `pages/api/share-bulk.js` now catch each recipient's send failure
  individually, flag that recipient's record(s), and report `failures` in
  the response instead of 500ing a batch that partially succeeded (a
  single-recipient `/api/share` call still 500s if its one send fails —
  there's nothing else to report). New admin-only endpoint
  `pages/api/share/resend.js` (covered by the same middleware matcher as
  every other `/api/*` route) re-sends from the stored record and clears
  the flag on success. `pages/index.js` shows a red "⚠ email failed"
  badge (title = the error) and a "Resend" button next to Revoke.
- **Verified:** L0 (`npm run build` clean, route registered) + a live L2/L3
  pass against a mock Upstash-REST KV and a mock SMTP listener (both
  throwaway, not committed): created a share with SMTP unreachable → record
  persisted with `emailFailed: true` + the real connect error →
  `/api/share/resend` with SMTP still down → 502, flag stays → fixed SMTP →
  resend → `{"ok":true}` → `emailFailed`/`emailError` both absent from the
  record afterward. Bulk: 2 recipients × 2 videos with working SMTP → 4
  distinct tokens, no flags; killed SMTP mid-batch for a 3rd recipient →
  both of that recipient's records flagged, other recipients unaffected.
  Middleware boundary re-checked: `/api/share/resend` 401s without admin
  creds; `/api/watch/request-link` unaffected (still public, still 400 on
  empty body).
- **Not yet exercised:** live Resend API failures specifically (only SMTP
  failure was simulated) — the `deliver()` chokepoint means the same
  flag/resend path applies, but if Resend's SDK throws a differently-shaped
  error, `err.message` could read oddly in `emailError`. Low risk, unverified.
- **Follow-up 2026-07-20 (same day):** resend was generalized beyond
  failure-recovery. `resendOne` (exported from `pages/api/share/resend.js`)
  is no longer gated on `emailFailed` — any active share can be re-sent on
  demand (e.g. a recipient says they never got it, even though nothing was
  flagged). New `pages/api/share/resend-bulk.js` accepts `{tokens: [...]}`
  and resends each independently via the same `resendOne`, reporting
  `{succeeded: [...], failures: [...]}` — never fails the whole batch on one
  bad token. `pages/index.js` now shows a Resend button on EVERY active
  share row (not just flagged ones) plus row checkboxes and a "Resend N"
  bulk bar above the shares table, mirroring the existing video-selection
  bulk-share bar's pattern. Verified live (same mock KV/SMTP harness):
  resend succeeded on a share that never had `emailFailed` set; bulk resend
  of 3 valid tokens + 1 nonexistent token returned all 3 successes plus one
  `{error: "Share not found"}` failure without affecting the others;
  revoking a token mid-batch correctly produced `{error: "Share is revoked
  or expired"}` for that token only; both endpoints 401 without admin creds.

### (g) Automated tests
- Owned by bunny-sharing-validation-and-qa §4 (candidate `node --test` plan).
  Priority: rises sharply the moment any lifecycle rule-3 prediction is
  awkward to verify by hand twice.

### (h) Bulk "bundle" landing page — ADOPTED 2026-07-20
- **Was:** a bulk recipient got N links in one email with no single page
  listing them. Kept here as the record of the design decisions and what
  shipped, per lifecycle rule 5.
- **Design decisions made:** entity = new `bunnybundle:<id>` record
  (`lib/bundles.js`) holding ONLY `{id, email, tokens, createdAt, expiresAt}`
  — never a member's title/status, which is always re-read live from that
  member's own `bunnyshare:<token>` record (no second source of truth; see
  architecture-contract 2.6/5.1a). Gate semantics = ONE email verification
  unlocks the WHOLE bundle: the grant→cookie exchange
  (`pages/bundle/[bundleId].js`) mints a `gate_bundle_<id>` cookie for the
  listing page AND a standard `gate_<token>` cookie for every member, so
  clicking through to any video plays immediately without a second
  verification — while every video still independently re-checks
  revoked/expired on every render, so revocation and per-person tracking are
  completely unaffected.
- **What shipped:** `lib/bundles.js` (`createBundleRecord`,
  `getBundleMembers`); `pages/bundle/[bundleId].js` (gate + listing page,
  mirrors `pages/watch/[token].js`'s structure); `pages/api/bundle/request-link.js`
  (public, mirrors `pages/api/watch/request-link.js` — same uniform
  anti-enumeration response, same 15-min/30s TTL/throttle constants);
  `sendBundleMagicLinkEmail` (lib/mailer.js); `middleware.js` matcher widened
  to `"/api/((?!watch/|bundle/).*)"`; `pages/api/share-bulk.js` now creates
  one bundle per recipient per call and adds one "view them all in one
  place" line to the existing bulk email (additive, existing per-video links
  unchanged); `pages/api/cleanup.js` now also sweeps expired
  `bunnybundle:*` records (bundles have no `revoked` flag, expiry only).
- **Verified:** L0 (`npm run build` clean, both new routes registered) + a
  live L2/L3 pass against a mock Upstash-REST KV and a mock SMTP listener:
  bulk-shared 2 videos to one recipient → got a `bundleLink` in the API
  response → opened it unauthenticated → email form (not the list) →
  requested the bundle magic link → extracted the real grant from the raw
  SMTP message → exchanged it → response set THREE cookies in one response
  (`gate_bundle_<id>` + both `gate_<token>`s) → bundle listing then showed
  both videos as links → opening one video page directly with its own
  minted cookie played immediately (no re-verification) → revoked one member
  via `/api/revoke` → that video's `/watch` page showed "revoked" AND the
  bundle listing simultaneously downgraded that entry to non-clickable
  "Vid One — revoked" text while the other stayed a live link (proves no
  second source of truth) → a tampered grant on the bundle URL fell back to
  the email form, not the list. Middleware boundary re-checked:
  `/api/bundle/request-link` reachable unauthenticated (400 on empty body,
  not 401); `/api/share/resend` and `/api/shares` still 401 without admin
  creds. Anti-enumeration uniformity re-checked for the new endpoint
  (right/wrong/nonexistent-bundle all byte-identical responses).
- **Not yet exercised:** production deploy (P4-style, real https +
  Secure-cookie flag). The "no persistent bundle link in the shares table"
  gap noted here originally was closed 2026-07-21 — see item (k).
- **Follow-up 2026-07-20 (same day) — one bundle per email, not per call:**
  requirement: "if they are the same email, they should be in the same
  email" — repeat shares to a recipient (from any endpoint, in any order)
  should land in one running notification, not pile up separate emails.
  `findOrExtendBundle` (`lib/bundles.js`) replaces the plain
  `createBundleRecord` call in both `share-bulk.js` and (newly) `share.js`:
  it looks for an existing active bundle for the email first and extends it
  (union tokens, re-max expiresAt) instead of creating a second one; if none
  exists yet, it also sweeps in any other still-active, not-yet-bundled
  `bunnyshare:*` records for that email (covers shares made before this
  widening, or via the single-share endpoint before it participated in
  bundles at all) so the FIRST bundle for someone already reflects
  everything currently shared with them. `getBundleItems` (`lib/bundles.js`)
  builds `{videoTitle, link}` for a bundle's currently-active members, reused
  by both endpoints' emails so the content sent is always "everything active
  right now," not just "what this call created." `/api/share.js` sends the
  plain original single-video email only when the bundle it just
  created/extended has exactly one member (a genuine first-and-only share);
  the moment a second one exists (this call or a prior one, either
  endpoint), it sends the same consolidated multi-item email
  `share-bulk.js` uses. Verified live against the mock KV/SMTP harness:
  two separate `/api/share` calls to the same address → first sends the
  plain email, second sends ONE email listing BOTH videos with the SAME
  bundle link as the first response; a bulk share followed by a single
  share to the same recipient consolidated the same way across endpoints; a
  manually-injected pre-existing un-bundled `bunnyshare` record was folded
  into a brand-new bundle by the orphan sweep; a REVOKED orphan record was
  correctly excluded from the sweep (bundle stayed single-member, plain
  email sent); an unrelated third recipient's share was unaffected (still
  gets the plain email, distinct bundle). Not yet exercised: behavior at
  meaningfully large numbers of bundles/shares (the orphan sweep is two full
  `KEYS` scans on a cold bundle — same accepted-for-now performance class as
  roadmap item a, now also reachable from `/api/share.js`, not just admin
  listing/cleanup/bulk).

### (i) Extend a share's expiry — ADOPTED 2026-07-21
- **Was:** the only way to give a recipient more time was revoke + re-share,
  which mints a brand-new token and breaks the existing link/bookmark — the
  one workflow that actively violated the never-break-live-links rule.
- **What shipped:** `extendOne` (exported from `pages/api/share/extend.js`)
  takes `{token, hours}`, rejects revoked records
  (`"Cannot extend a revoked share"`) and non-positive/non-numeric `hours`,
  and otherwise sets `expiresAt = Math.max(Date.now(), record.expiresAt) +
  hours*3600*1000` in place — same token, same URL, same cookie, nothing
  else changes. Deliberately allowed on an ALREADY-EXPIRED (not revoked)
  share — extending from `Date.now()` rather than the stale past expiry, so
  "it died, give me a bit more time" (the common real case) works correctly
  instead of silently landing back in the past for a small `hours` value.
  `pages/api/share/extend-bulk.js` applies the same logic to
  `{tokens: [...], hours}`, reporting `{succeeded, failures}` per token —
  never fails the whole selection on one bad/revoked/missing token, same
  pattern as `resend-bulk`. `extendBundleForToken` (`lib/bundles.js`)
  re-maxes a member's bundle's `expiresAt` too, so the bundle listing
  doesn't lapse before a member that now legitimately outlives it (one-way:
  only ever grows). Admin UI: an "Extend" button appears on every
  non-revoked row (Active OR Expired — unlike Resend/Revoke, which stay
  Active-only) using a plain `prompt()` for the hours value (no new modal —
  matches the codebase's existing use of `confirm()` for lightweight admin
  actions); the existing bulk-select checkboxes (shared with bulk Resend)
  were widened from Active-only to non-revoked, and an "Extend N" button
  sits next to "Resend N" in the bulk bar.
- **Verified:** L0 (`npm run build` clean, both routes registered) + a live
  L2/L3 pass against the mock KV/SMTP harness: created a 1-hour share,
  extended it 48h, confirmed the new `expiresAt` was exactly +48h from the
  OLD value (not from now, since it hadn't expired yet); created a
  ~3.6-second share, let it actually expire, extended it 24h, confirmed the
  new `expiresAt` landed ~24h from `Date.now()` at extend-time, not from the
  long-past stale expiry; extending a revoked share returned the exact
  rejection message and left `expiresAt` untouched; extending one member of
  a 2-video bundle by 500h correctly re-maxed the bundle's own `expiresAt`
  to match; bulk extend with a mix of a valid token and nonexistent/garbage
  tokens returned the valid one's success plus a `"Share not found"` failure
  per bad token without affecting the good one. Middleware boundary
  re-checked: both new routes 401 without admin creds;
  `/api/watch/request-link` unaffected.
- **Not yet exercised:** production deploy, and un-revoking a share was
  deliberately left OUT of scope — extend refuses revoked records outright
  rather than quietly doubling as an undo for Revoke, which should stay a
  separate, explicit, and more carefully considered action if it's ever
  added.

### (j) Bulk revoke — ADOPTED 2026-07-21
- **Was:** Revoke only existed as a single-token action; an admin wanting to
  cut off several shares at once (e.g. an entire batch shared to the wrong
  address) had to click Revoke once per row.
- **What shipped:** `revokeOne(token)` (exported from `pages/api/revoke.js`)
  extracted the existing single-revoke logic and made it explicitly
  idempotent — revoking an already-revoked record is a no-op success, not an
  error, so a batch containing one already-revoked token doesn't spuriously
  fail. `pages/api/revoke-bulk.js` applies `revokeOne` to
  `{tokens: [...]}`, reporting `{succeeded, failures}` per token — same
  never-fail-the-whole-batch pattern as `resend-bulk`/`extend-bulk`. Admin
  UI: the existing multi-select checkboxes (shared with bulk Resend/Extend,
  visible on any non-revoked row) gained a "Revoke N" button (danger-styled,
  with the same `confirm()` guard the single-row Revoke button already uses)
  in the same bulk bar.
- **Verified:** L0 (`npm run build` clean, route registered) + a live L2/L3
  pass against the mock KV/SMTP harness: bulk-revoked 2 of 3 created shares
  in one call alongside 1 nonexistent token → both valid ones flipped to
  `revoked: true`, the third untouched, the bogus one reported as a clean
  `"Share not found"` failure; re-revoking an already-revoked token in a
  second bulk call succeeded (no error) proving idempotency; the pre-existing
  single-token `/api/revoke` endpoint's behavior (200 on success, 404 for an
  unknown token) was unaffected by the refactor. Middleware boundary
  re-checked: `/api/revoke-bulk` 401s without admin creds.
- **Not yet exercised:** production deploy. Bulk revoke was NOT extended to
  also un-revoke (select revoked rows and restore them) — that's a
  meaningfully different, riskier action (silently restoring access someone
  deliberately cut off) and was left out of scope on purpose, same reasoning
  as item i's decision not to let Extend double as an undo for Revoke.

### (k) Restore (un-revoke) + persistent bundle link in admin table — ADOPTED 2026-07-21
- **Was:** two gaps left open by prior entries as deliberately out of scope
  or noted as low priority: (1) items (i) and (j) both refused to let Extend
  or bulk-revoke double as an "un-revoke," leaving no way to undo an
  accidental Revoke short of re-sharing (a new token, breaking the old
  link); (2) item (h) noted the bundle link only ever surfaced once, in the
  bulk-share success toast, with no durable place to find it again.
- **What shipped:** `unrevokeOne(token)` (`pages/api/unrevoke.js`, mirroring
  `revokeOne`'s shape) flips `revoked` back to `false` — same flag-flip,
  never-delete model as Revoke (non-negotiable 9), idempotent the same way.
  Kept as its own single-token endpoint, deliberately NOT folded into Extend
  or given a bulk form yet, for the same reasoning items (i)/(j) gave for
  leaving it out: restoring cut-off access is a more consequential action
  than extending or revoking, and shouldn't ride along with either as a
  side effect. Admin UI: a "Restore" button appears only on revoked rows.
  Separately, `bundleLinksForTokens(tokens, siteUrl)` (`lib/bundles.js`)
  scans `bunnybundle:*` ONCE and maps every token in the list to its
  bundle's link, rather than one scan per token; `/api/shares.js` calls it
  for the whole listing and attaches `bundleLink` to each record in the
  response only (not stored on the `bunnyshare:*` record itself). Admin UI
  shows it as a small "bundle page" link under the `/watch/<token>` link on
  any row that has one, always visible regardless of that share's own
  Active/Expired/Revoked status.
- **Verified:** L0 only so far (`npm run build` clean; `/api/unrevoke`
  registered; invariant greps re-run: matcher unchanged, `bunnyshare:`
  prefix unchanged, no stray bare `share:` keys, `revoked = true`/`revoked:
  false` both present with no `kvDel`, cookie name/path unchanged). No live
  L2/L3 pass yet against the mock KV/SMTP harness — unlike items (f) through
  (j), this entry has NOT been exercised end-to-end with real records.
- **Not yet exercised:** a live pass proving (a) a revoked share's Restore
  button brings it back to exactly its pre-revoke state and an already-
  expired-and-revoked share restores to "Expired" (not a working link,
  since Restore doesn't touch `expiresAt`); (b) a share belonging to a
  2+-member bundle shows the same bundle link as its siblings in the admin
  table; (c) a share NOT in any bundle shows no bundle link and the API
  response for it is byte-identical to before this change (no stray
  `bundleLink: undefined` key). Also: no bulk Restore, and production
  deploy, both deliberately out of scope for the reasons above.

## 3. Positioning: standard vs actually nice

Standard practice, competently applied (claim nothing): magic links, HMAC-SHA256
signed tokens, signed CDN URLs, Upstash KV, Basic Auth for a single admin.

Genuinely nice design worth preserving (the things a refactor would most
easily destroy): the uniform-response anti-enumeration gate; Path-scoped
per-share cookies (`gate_<token>`; one verification never leaks across
shares); the stateless grant design (nothing to store, rotation = instant
global invalidation); per-video tokens in bulk (independent revocation by
construction).

## 4. Where ideas come from here (observed, not aspirational)

Git history shows every adopted idea originated from: a security scanner
finding (CodeQL → escapeHtml/isValidUrl), a real incident (thumbnail 403s →
signCdnUrl), or a concrete user request (bulk + email gating → the
2026-07-18 build). None came from speculative refactoring. Implication:
prefer instrumenting and listening (audit log, error surfacing — items d/f)
over inventing features.

## When NOT to use this skill

- Executing the gate certification → bunny-sharing-email-gate-campaign.
- Understanding current design/invariants → bunny-sharing-architecture-contract.
- Checking if an idea was already rejected → bunny-sharing-failure-archaeology.
- Classifying/gating a change you've picked → bunny-sharing-change-control.

## Provenance and maintenance

Written 2026-07-18 against branch claude/bulk-share-separate-links-auth-cblrle.

- (a) still true: `grep -n "keys/" lib/kv.js` and `grep -n "kvKeys" pages/api/shares.js pages/api/cleanup.js`
- (d) still true: `grep -n "u === user" middleware.js` (plain compare present)
- (e) still true: `grep -n "itemsPerPage" lib/bunny.js` (=100, no page param)
- (f) still true: `grep -n -A3 "createShareRecord" pages/api/share.js` (record write precedes sendShareEmail)
- Entry ownership: campaign items → `grep -n "Hardening menu" .claude/skills/bunny-sharing-email-gate-campaign/SKILL.md`
- Remove or update entries here as they are adopted (record outcomes in failure-archaeology).
