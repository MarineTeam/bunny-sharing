---
name: bunny-sharing-run-and-operate
description: >
  Operate the bunny-sharing app: run dev/build/start, understand the admin and
  recipient user journeys end-to-end (what happens server-side at each step),
  KV data conventions (bunnyshare:/gatethrottle: keys), and the operating
  runbook — revoke shares, inspect shares, run cleanup, rotate GATE_SECRET or
  ADMIN_PASS, deploy to Vercel. Load this when running the app, answering "how
  does the flow work", or performing routine admin/ops tasks on a working
  deployment. Do NOT load for first-time environment/env-var setup
  (bunny-sharing-env-and-setup), for diagnosing failures
  (bunny-sharing-debugging-playbook), or for measuring/probing live systems
  (bunny-sharing-diagnostics).
---

# Run and operate bunny-sharing

Runbook for running the app locally, understanding both user journeys as
built, knowing where state lives, and doing routine operations. Everything
below was verified against the source on 2026-07-18. All commands assume
`cwd` = repo root (`/home/user/bunny-sharing` in the dev container; adjust to
wherever the repo is checked out).

Jargon used once, defined once:

- **Share record** — one JSON blob in Upstash Redis representing one
  video-to-one-recipient share, keyed by an unguessable token.
- **Magic link** — a short-lived (15 min) signed URL emailed to a recipient so
  they can prove control of the email a share was sent to.
- **Grant** — a stateless HMAC-SHA256-signed string (`lib/gate.js`) carried
  either in a magic link's `?grant=` query param or in a per-share cookie.
- **KV** — Upstash Redis reached over its REST API (`lib/kv.js`). This is the
  app's ONLY datastore.

## 1. Command anatomy

There are exactly three npm scripts (`package.json`); no test, lint, or other
scripts exist.

| Command | What it does |
| --- | --- |
| `npm run dev` | `next dev` — dev server on http://localhost:3000. Needs a populated `.env.local` for anything real to work (Basic Auth env vars, Bunny, KV, email, GATE_SECRET). If env vars are missing, see bunny-sharing-env-and-setup. |
| `npm run build` | `next build` — production build with Turbopack (Next.js 16.2.10). **Needs NO env vars**: all config is read at request time, and `lib/gate.js`'s fail-loud `GATE_SECRET` check is runtime-only. Verified 2026-07-18: build succeeds in a shell with no `.env.local` and no env vars set. |
| `npm run start` | `next start` — serves the production build on port 3000. Run `npm run build` first. This DOES need env vars to serve real traffic. |

### Expected build output (as of 2026-07-18, next 16.2.10)

A healthy build prints this exact route manifest — 10 routes plus the
middleware line:

```
Route (pages)
┌ ○ /
├ ○ /404
├ ƒ /api/cleanup
├ ƒ /api/revoke
├ ƒ /api/share
├ ƒ /api/share-bulk
├ ƒ /api/shares
├ ƒ /api/videos
├ ƒ /api/watch/request-link
└ ƒ /watch/[token]

ƒ Proxy (Middleware)
```

`○` = static, `ƒ` = server-rendered on demand. If a route is missing or a
page unexpectedly flips between `○` and `ƒ`, something changed in `pages/`.

### The deprecation warning is EXPECTED — do not "fix" it casually

Every build prints:

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead. Learn more: https://nextjs.org/docs/messages/middleware-to-proxy
```

This is known and deliberate. `middleware.js` implements the Basic Auth
boundary with the matcher `["/", "/api/((?!watch/).*)"]`
(middleware.js:29-32) — the security perimeter of the whole app. Renaming
`middleware.js` to `proxy.js` is a behavior-affecting change to that
perimeter and must go through bunny-sharing-change-control, with the matcher
invariant re-verified (all admin routes 401 without credentials; `/api/watch/*`
and `/watch/*` stay public). Never do it as a drive-by "fix the warning" edit.

## 2. The two user journeys (as built)

### 2a. ADMIN journey

1. **Open `/`** → the browser gets a 401 with `WWW-Authenticate: Basic
   realm="Admin"` from `middleware.js` and shows a Basic Auth prompt. Sign in
   with `ADMIN_USER` / `ADMIN_PASS` (exact string compare of the decoded
   `Authorization` header, middleware.js:12-21).
2. **Video grid loads** — `pages/index.js` fires `GET /api/videos` and
   `GET /api/shares` in parallel (`loadAll()`, pages/index.js:25-34).
   `/api/videos` calls Bunny's Stream API (`lib/bunny.js` `listVideos`,
   AccessKey header, `itemsPerPage=100`). Thumbnail URLs come from
   `BUNNY_PULL_ZONE` and, if `BUNNY_CDN_TOKEN_KEY` is set, are **signed**
   (`signCdnUrl` in lib/bunny.js — required when the pull zone has Token
   Authentication enabled; unsigned thumbnails 403 in that case).
3. **Single share** — click Share on a card → modal asks for recipient email
   + hours (default 72) → `POST /api/share` with
   `{videoId, videoTitle, email, hours}`. Server side
   (`pages/api/share.js`): `createShareRecord` (lib/shares.js) mints
   `token = crypto.randomBytes(16).toString("hex")`, writes the record to
   `bunnyshare:<token>`, then `sendShareEmail` emails the recipient
   `<site>/watch/<token>`. NOTE: the record is stored BEFORE the email is
   sent — an email failure still leaves a live share record (known weak
   point).
4. **Bulk share** — tick Select checkboxes on 2+ cards → a bulk bar appears
   with an emails field (comma/space/semicolon-separated, one or more) and
   ONE hours field → `POST /api/share-bulk` with
   `{videos: [{id, title}, ...], emails: [..], hours}` (legacy single
   `email` string still accepted). Server side (`pages/api/share-bulk.js`):
   loops recipients × videos, calls `createShareRecord` once per pair
   (skipping entries with falsy `id`; 400 if none valid) → **M×N distinct
   tokens, each independently revocable** — then sends each recipient ONE
   consolidated email listing only their own links (`sendBulkShareEmail`).
   A failed send for one recipient is reported in the response `failures`
   array without blocking the others (their records exist — resend or
   revoke). Invariant: bulk never reuses a token across pairs. Views are
   tracked per record (`viewCount`/`lastViewedAt`, shown in the shares
   table's Views column), and real playback separately
   (`playCount`/`maxProgressPct`/`completedAt` via `/api/watch/track`,
   shown in the Watched column: `—` / `started` / `NN%` / `100% ✓`) — so
   with per-recipient links you can see who opened AND who actually
   watched what.
5. **Shares table** — rendered from `GET /api/shares`
   (`pages/api/shares.js`: `KEYS bunnyshare:*`, fetch each, sort by
   `createdAt` desc). Status is NOT stored; it is derived client-side by
   `statusOf` (pages/index.js:112-116): `revoked` → "Revoked",
   `Date.now() > expiresAt` → "Expired", else "Active".
6. **Revoke** — the Revoke button (only shown for Active rows) confirms then
   `POST /api/revoke` with `{token}`. Server side sets `revoked: true` on the
   record and writes it back — a flag flip, never a delete (invariant:
   reversible/auditable).
7. **Cleanup** — the "Clean up expired & revoked" button confirms then
   `POST /api/cleanup`. Server side scans `bunnyshare:*` and DELETES every
   record that is revoked or past `expiresAt`, returning `{deleted: <n>}`.
   This is the only path that removes records.

### 2b. RECIPIENT journey

1. **Email link** — recipient clicks `<site>/watch/<token>` from the share
   email. This page is public (never matched by the middleware).
2. **Server loads the record** — `getServerSideProps` in
   `pages/watch/[token].js` reads `bunnyshare:<token>`. Missing → "Link not
   found." Revoked → "Access to this video has been revoked." Expired →
   "This link has expired." (each a terminal error page, no email form).
3. **Email form** — with a valid record and no grant, the page renders the
   EmailGate form. Recipient types their address → `POST
   /api/watch/request-link` with `{token, email}`.
4. **Uniform response** — `pages/api/watch/request-link.js` returns the SAME
   generic 200 ("If that email matches this link, we've sent a sign-in link
   to it.") for invalid/revoked/expired links, mismatched emails, throttled
   repeats, AND success. This anti-enumeration behavior is an invariant — do
   not add distinguishing responses. On an actual match it: checks/sets the
   `gatethrottle:<token>` marker (skip send if present), signs a 15-minute
   grant, and emails the magic link
   `<site>/watch/<token>?grant=<...>` (`sendMagicLinkEmail`).
5. **Magic-link click** — back in `getServerSideProps`: `?grant=` is
   verified (`verifyGrant`: timing-safe HMAC check, expiry check, bound to
   this token). Valid → the server signs a LONGER-lived cookie grant
   (expiring with the share) and sets cookie `gate_<token>` with `HttpOnly;
   Path=/watch/<token>; SameSite=Lax; Max-Age=<seconds until share expiry>`
   plus `Secure` when the request is https — then 307-redirects to the clean
   `/watch/<token>` URL so the grant leaves the address bar. Invalid/expired
   grant → email form again with a "That sign-in link has expired" notice.
6. **Playback** — on the clean URL with a valid cookie, the server calls
   `generateEmbedUrl(videoId, 3600)` (signed Bunny embed URL, 1-hour token)
   and renders the iframe player.
7. **Re-verification is per-share and per-browser** — the cookie is
   Path-scoped to exactly `/watch/<token>`, so a recipient with 3 bulk links
   verifies 3 times (once per link). A new browser, cleared cookies, or
   cookie expiry all mean re-running steps 3-5. This is by design, not a bug.

## 3. Data conventions: where state lives

**Nothing is stored on disk.** All app state lives in Upstash Redis (via
`KV_REST_API_URL`/`KV_REST_API_TOKEN`); videos and thumbnails live in
Bunny.net. A redeploy or container wipe loses nothing.

### Key: `bunnyshare:<token>` — share records (permanent until cleanup)

One JSON object per share, written by `createShareRecord` (lib/shares.js):

| Field | Type | Meaning |
| --- | --- | --- |
| `token` | string | 32 hex chars (`crypto.randomBytes(16)`), same as in the key and the `/watch/` URL |
| `videoId` | string | Bunny video GUID |
| `videoTitle` | string | Title at share time (falls back to `videoId`) |
| `email` | string | Recipient address, stored as typed (compared case-insensitively by the gate) |
| `createdAt` | number | ms epoch |
| `expiresAt` | number | ms epoch = createdAt + hours×3600×1000 (default 72 h) |
| `revoked` | boolean | `false` at creation; flipped to `true` by /api/revoke |

Do NOT rename the key prefix or field names — live links depend on them
(prime invariant: never break live links; see
bunny-sharing-architecture-contract).

### Key: `gatethrottle:<token>` — magic-link throttle markers (self-expiring)

Written by `pages/api/watch/request-link.js` via `kvSetEx(key, 1, 30)` —
value `1`, Redis `EX=30`, so it auto-expires after 30 seconds. While present,
repeat magic-link requests for that share silently skip the email send (the
response is still the generic 200). These keys never need manual cleanup.

## 4. Operating tasks runbook

All admin API calls require Basic Auth. Set once per shell:

```bash
export SITE=https://your-deployment.example   # or http://localhost:3000
export ADMIN_USER=... ADMIN_PASS=...
```

### Inspect all shares

```bash
curl -u "$ADMIN_USER:$ADMIN_PASS" "$SITE/api/shares"
```

Returns `{"shares":[...]}` sorted newest-first. Remember status
(Active/Expired/Revoked) is not a field — derive it: `revoked` true →
Revoked; `expiresAt < now-ms` → Expired; else Active.

### Revoke a share

UI: `/` → Shared Links table → Revoke button on the Active row. Or:

```bash
curl -u "$ADMIN_USER:$ADMIN_PASS" -X POST "$SITE/api/revoke" \
  -H "Content-Type: application/json" \
  -d '{"token":"<32-hex-token>"}'
```

`{"ok":true}` on success; 404 `{"error":"Share not found"}` for an unknown
token. Effect is immediate: the `/watch` page checks `record.revoked` on
every request, so even a recipient holding a valid cookie is blocked on next
load. Revoke does not delete the record (reversible by design — flipping the
flag back via KV restores access, though no endpoint does that today).

### Run cleanup manually

```bash
curl -u "$ADMIN_USER:$ADMIN_PASS" -X POST "$SITE/api/cleanup"
```

Returns `{"deleted":<n>}`. Deletes only revoked-or-expired records; active
shares are never touched.

### Cleanup on a schedule — NOT configured yet (verified 2026-07-18)

The README's Deployment section says only that you can "optionally schedule
`/api/cleanup` (e.g. a Vercel Cron job)" — it is stated as an intent, not a
setup. There is **no `vercel.json` in the repo**, so no cron schedule is
actually configured. If you add one, know the as-built constraints before
assuming it works:

- `pages/api/cleanup.js` accepts POST only (405 otherwise), and Vercel Cron
  invokes endpoints with GET (Vercel-documented behavior as of 2026-07-18).
- `/api/cleanup` sits behind the Basic Auth middleware, which a bare cron
  request will fail with 401.

So a naive `vercel.json` crons entry will NOT work as-built; making it work
is a code change (method/auth handling) → route through
bunny-sharing-change-control. Until then, cleanup is manual (button or curl).
Skipping cleanup is safe operationally — stale records just accumulate and
show as Expired/Revoked rows; the cost is a growing `KEYS bunnyshare:*` scan.

### Rotate GATE_SECRET (the emergency lever)

Change `GATE_SECRET` in the deployment env and redeploy/restart.
Consequence, from how `lib/gate.js` signs both artifacts with the same
secret:

- **Instantly invalidated:** every outstanding magic link (unclicked
  `?grant=` URLs) and every viewer cookie (`gate_<token>`). Grants signed
  with the old secret fail `verifyGrant` and recipients drop back to the
  email form.
- **Still working:** the share links themselves. `bunnyshare:*` records and
  `/watch/<token>` URLs don't involve GATE_SECRET — recipients simply
  re-verify their email and keep watching.

This makes rotation the documented cheap emergency response to a suspected
grant/cookie leak: it costs every active viewer one email round-trip and
nothing else. It does NOT revoke any share — use /api/revoke for that.

### Rotate ADMIN_PASS (and/or ADMIN_USER)

Change the env var(s) in the deployment and redeploy/restart. Effect is
immediate — the middleware compares against the env on every request, so old
credentials get 401 on the next hit and browsers re-prompt. No sessions or
tokens exist to invalidate. Recipients are unaffected (`/watch/*` and
`/api/watch/*` never see Basic Auth). Anyone using the curl runbook above
must update their exported `ADMIN_PASS`.

## 5. Deploy

- **Target: Vercel**, per the README's Deployment section — "deploys as a
  standard Next.js app". Set every env var in the Vercel dashboard (the full
  catalog and which are required is in bunny-sharing-env-and-setup); the
  Upstash Redis KV can come from the Vercel Storage/marketplace tab or a
  standalone upstash.com database — both expose the same
  `KV_REST_API_URL`/`KV_REST_API_TOKEN`.
- **There is no CI/CD in this repo** (no `.github/workflows/`, verified
  2026-07-18; scanners were tried and removed — see
  bunny-sharing-failure-archaeology). Deploys are whatever Vercel's git
  integration does on push: no tests, no gates, no checks run first.
  Pre-push verification is therefore manual — follow
  bunny-sharing-change-control before pushing anything.
- **Local prod-mode test** before pushing:

  ```bash
  npm run build && npm run start
  ```

  then exercise both journeys against http://localhost:3000 with a real
  `.env.local`. This is the closest local approximation of the Vercel
  runtime.

## When NOT to use this skill

- **First-time environment creation** (getting Bunny/Upstash/Resend
  credentials, writing `.env.local`, env-var traps) →
  `bunny-sharing-env-and-setup`.
- **Something is failing** (401s, 403 thumbnails, emails not arriving, KV
  errors, gate loops) → `bunny-sharing-debugging-playbook`.
- **Measuring or probing** (KV inspection scripts, gate self-test, email or
  Bunny probes) → `bunny-sharing-diagnostics`.
- Changing behavior rather than operating it → `bunny-sharing-change-control`
  first; architecture rationale → `bunny-sharing-architecture-contract`.

## Provenance and maintenance

Every fact above was read from the repo at branch
`claude/bulk-share-separate-links-auth-cblrle` on 2026-07-18. Re-verify
before trusting, in one line each:

| Claim | Re-verify with |
| --- | --- |
| npm scripts are exactly dev/build/start | `cat package.json` |
| Route manifest (10 routes) + middleware deprecation warning | `npm run build` (compare output to section 1) |
| Build needs no env vars | `env -i PATH="$PATH" HOME="$HOME" npm run build` in a checkout with no `.env.local` |
| Basic Auth matcher / public routes | `cat middleware.js` (matcher at bottom) |
| Share record fields + key prefix | `grep -n "bunnyshare" lib/shares.js pages/api/*.js pages/watch/*.js` and read `createShareRecord` in `lib/shares.js` |
| Throttle key, TTL 30 s, magic-link TTL 15 min | `grep -n "THROTTLE_SECONDS\|MAGIC_LINK_TTL_MS\|gatethrottle" pages/api/watch/request-link.js` |
| Cookie name/scope/flags | `grep -n "Set-Cookie\|cookieName" "pages/watch/[token].js"` |
| Status derived client-side | `grep -n "statusOf" pages/index.js` |
| Revoke = flag flip; cleanup = delete revoked/expired | `cat pages/api/revoke.js pages/api/cleanup.js` |
| No cron configured | `ls vercel.json` (should error: No such file) |
| No CI | `ls .github/workflows` (should not exist) |
| README cron wording | `grep -n cleanup README.md` |
