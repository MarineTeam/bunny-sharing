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

### (f) Email-send failure handling (pages/api/share.js, share-bulk.js)
- **Why (verified behavior as of 2026-07-18):** the KV record is written
  BEFORE the email sends; a mailer failure then returns 500 — so a share
  exists that no one was told about. The admin sees "Error" yet the share
  appears in the table (confusing ghost).
- **Asset:** the shares table already displays status; deliver() already
  throws typed messages.
- **First steps:** (1) decide policy — best: mark the record
  (`emailFailed: true`, an ADDITIVE field — compatibility-safe) and surface a
  "resend email" button; deleting the record on failure is the alternative
  but loses the audit trail; (2) add a `/api/share/resend` admin endpoint
  reusing sendShareEmail; (3) prediction: with SMTP creds deliberately broken,
  creating a share yields a table row flagged "email failed" and resend works
  after fixing creds.
- **Result when:** the broken-creds experiment shows the flagged row and a
  successful resend, and old records (no `emailFailed` field) render
  unchanged.

### (g) Automated tests
- Owned by bunny-sharing-validation-and-qa §4 (candidate `node --test` plan).
  Priority: rises sharply the moment any lifecycle rule-3 prediction is
  awkward to verify by hand twice.

### (h) Bulk "bundle" landing page
- **Why:** a bulk recipient gets N links in one email; a single landing page
  listing their videos would be friendlier.
- **Compatibility question to answer FIRST (design pass required):** today
  bulk creates N independent records with no grouping entity. A bundle page
  needs either a new `bunnybundle:<id>` record listing member tokens
  (additive — safe) or a `bundleId` field on share records (additive — also
  safe). Either way existing N-link emails and per-video /watch URLs must
  keep working; the bundle page is an ADDITION, never a replacement.
- **First steps:** (1) write the design note (entity choice, gate semantics —
  does one email verification unlock the bundle page but still per-video
  cookies?); (2) prototype `/bundle/<id>` read-only listing; (3) route
  through change-control as behavior-affecting.
- **Result when:** a bulk share yields one bundle link whose page lists
  exactly its member videos, each still individually gated and revocable,
  with the P3 distinctness check still passing.

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
