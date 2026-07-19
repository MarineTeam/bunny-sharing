---
name: bunny-sharing-validation-and-qa
description: >
  Evidence standards for the bunny-sharing repo: the L0-L4 evidence ladder
  (build → gate self-test → live probes → manual E2E checklists → campaign
  certification), the checkbox E2E procedures for single share, bulk share,
  expiry, anti-enumeration, and the middleware auth boundary, the
  golden/certified inventory, and the candidate plan for adding automated
  tests (none exist today). Load this when you need to know WHAT COUNTS AS
  PROOF that a change works, before claiming anything "works", or when adding
  tests. Do NOT load this to pick a probe for a live failure
  (bunny-sharing-debugging-playbook), to run the probes themselves
  (bunny-sharing-diagnostics), or for the gate's live certification protocol
  (bunny-sharing-email-gate-campaign).
---

# bunny-sharing validation and QA

There is no test framework, no linter, and no CI in this repo (as of
2026-07-18: `package.json` has only `dev`/`build`/`start` scripts; no
`.github/` directory exists — two security-scanner workflows were tried and
deleted, see bunny-sharing-failure-archaeology). Evidence is therefore
explicit and manual. "It looks right" is never evidence.

## 1. The evidence ladder

| Level | Evidence | Command / procedure | Proves |
| --- | --- | --- | --- |
| L0 | Production build passes | `npm run build` | Code compiles; routes register. Necessary, never sufficient. |
| L1 | Gate self-test 9/9 | `node .claude/skills/bunny-sharing-diagnostics/scripts/gate-selftest.mjs` | lib/gate.js crypto contract holds. No network needed. |
| L2 | Targeted live probe | kv-inspect / bunny-probe / email-probe (bunny-sharing-diagnostics) with real creds | The specific integration (KV, Bunny, email) works against real services |
| L3 | Manual E2E checklist (below) | Deployed or dev instance, real accounts | The user-visible flow works end to end |
| L4 | Campaign certification | bunny-sharing-email-gate-campaign completed with logged observations | The gate's security claims hold live |

Required level by change class (classes defined in
bunny-sharing-change-control — that skill owns classification; this one owns
what each level means):

- Safe (docs/cosmetic): L0.
- Behavior-affecting: L0 + the L2/L3 items covering the touched surface.
- Compatibility-critical: L0 + L1 (if gate/token related) + the L3 backward-compat checks (old links still work).
- Security-sensitive: L0 + L1 + the relevant L4/P2 adversarial predictions.

## 2. Manual E2E checklists

Run against `npm run dev` (http://localhost:3000) or a deployment. Each box
must be literally observed, not assumed.

### Single share
- [ ] Create share from admin UI (real recipient email you control).
- [ ] Share email arrives; link is `<site>/watch/<32-hex-token>`.
- [ ] Opening the link shows the email form (NOT the video).
- [ ] Submitting the matching email → "Check your email" page; magic-link email arrives.
- [ ] Clicking the magic link → video plays; URL bar shows the clean `/watch/<token>` (no `?grant=`).
- [ ] Reload → still plays (cookie grant).
- [ ] Revoke in admin UI → reload → "Access to this video has been revoked."

### Bulk share (the feature's core claims: separate links per recipient × video, per-person tracking)
- [ ] Select ≥2 videos, TWO recipients (comma-separated, both inboxes you control), send.
- [ ] EACH recipient gets ONE email listing only their own links (2 emails total; recipient A's links absent from B's email).
- [ ] Extract ALL links from both emails; assert all tokens DISTINCT — paste into a file and run `grep -o 'watch/[a-f0-9]*' links.txt | sort | uniq -d` (must print nothing). With 2×2 that's 4 distinct tokens.
- [ ] Each link gates independently (email verify on link 1 does not unlock link 2 — cookie is Path-scoped), and recipient A's email does NOT pass the gate on recipient B's link.
- [ ] Revoke ONE pair (e.g. recipient A × video 2) → A's other link and both of B's links still work.
- [ ] Comma-string regression guard: POST `/api/share-bulk` with legacy shape `{"videos":[...],"email":"a@b.c, d@e.f"}` and `/api/share` with `{"videoId":"...","email":"a@b.c, d@e.f"}` → each stored record's `email` field holds exactly ONE address (verify via kv-inspect), never the combined string.
- [ ] View tracking: watch one link → its shares-table row shows Views `1×` (hover shows last-viewed time); the unwatched rows show `—`. Reload the watch page → count increments.
- [ ] Playback tracking (needs a real Bunny video): press play → row's Watched column shows `started`; scrub past 25/50/75% → shows the milestone %; play to the end → `100% ✓`. Opening the page WITHOUT pressing play must leave Watched at `—` while Views increments — that separation is the feature's point.

### Expiry
- [ ] Create a share with hours = a small fraction (e.g. 0.02 ≈ 72 s — `hours` is multiplied by 3600·1000; verify the record's expiresAt via kv-inspect).
- [ ] After expiry: `/watch/<token>` shows "This link has expired."; request-link on it returns the generic 200 but sends nothing.

### Anti-enumeration (uniform response)
The gate must not reveal which email a link belongs to. Diff the actual bytes:
```bash
curl -s -X POST localhost:3000/api/watch/request-link -H 'Content-Type: application/json' \
  -d '{"token":"<real-token>","email":"right@example.com"}' > /tmp/right.json
curl -s -X POST localhost:3000/api/watch/request-link -H 'Content-Type: application/json' \
  -d '{"token":"<real-token>","email":"wrong@example.com"}' > /tmp/wrong.json
diff /tmp/right.json /tmp/wrong.json && echo UNIFORM
```
- [ ] `UNIFORM` prints (bodies identical; both HTTP 200). Expected body (as of 2026-07-18): `{"ok":true,"message":"If that email matches this link, we've sent a sign-in link to it."}`

### Middleware auth boundary
```bash
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/shares            # expect 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/watch/request-link \
  -H 'Content-Type: application/json' -d '{}'                                  # expect 400 (NOT 401)
```
- [ ] Admin API 401s without credentials; recipient API is reachable without credentials.

## 3. Golden / certified inventory

As of 2026-07-18:

| Surface | Status | Evidence |
| --- | --- | --- |
| Gate crypto (lib/gate.js) | CERTIFIED | gate-selftest 9/9, run 2026-07-18 |
| Production build | CERTIFIED | `npm run build` clean (with expected middleware-deprecation warning) |
| Everything live (email delivery, gate E2E, bulk E2E, Bunny playback) | UNCERTIFIED | Never exercised against real services — bunny-sharing-email-gate-campaign is the path to certification |

Update this table (via change-control) whenever a campaign phase or E2E
checklist upgrades a surface.

## 4. Adding automated tests — CANDIDATE plan (not current practice)

Nothing here is doctrine; route the decision through
bunny-sharing-change-control. Recommended shape, chosen to add zero
dependencies (the repo observably avoids new deps, though that is a
convention, not a stated rule): Node's built-in runner.

- First targets: `lib/gate.js` (pure crypto — port gate-selftest cases) and
  `lib/shares.js` (mock kvSet via injection or test the record shape).
- Sketch: add `"test": "node --test test/"` to package.json scripts; create
  `test/gate.test.mjs` with `import { test } from "node:test"` +
  `import assert from "node:assert"` wrapping the 9 self-test cases.
- Keep gate-selftest.mjs even after — it runs without any test infrastructure
  and is referenced by change-control's pre-push protocol.

## 5. Acceptance discipline

- A claim of "X works" must name its evidence level and show the observation
  (command + output), not a summary of intent.
- Claims about *uniformity* (anti-enumeration) and *distinctness* (bulk links)
  are only provable by diffing actual outputs — the commands above.
- A change that cannot be evidenced at its required level does not ship; it
  stays a labeled candidate.

## When NOT to use this skill

- Diagnosing a live failure → bunny-sharing-debugging-playbook.
- Running the measurement scripts → bunny-sharing-diagnostics.
- The gate's full live certification → bunny-sharing-email-gate-campaign.
- Classifying a change → bunny-sharing-change-control.

## Provenance and maintenance

Verified 2026-07-18 on branch claude/bulk-share-separate-links-auth-cblrle.

- Still no tests/CI: `cat package.json | grep -A4 scripts; ls .github 2>&1` (expect no test script; No such file).
- Generic message string: `grep -n "sign-in link to it" pages/api/watch/request-link.js`.
- 401 boundary: `grep -n "matcher" middleware.js` (expect `/api/((?!watch/).*)`).
- Hours→ms math: `grep -n "3600 \* 1000" lib/shares.js`.
- Golden inventory freshness: re-run gate-selftest and `npm run build` before trusting the table.
