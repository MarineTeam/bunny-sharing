# Changelog

Notable changes to this project, newest first. Grouped by date, since most
days below were their own batch of work rather than a discrete release.
Three version tags mark points release notes were cut from this history:

- **v1.2.0** — the email watermark (layered global / per-share / per-video /
  exemption control), per-video analytics, and resume playback.
- **v1.1.0** — everything from 2026-07-18 through 2026-07-21 (bulk sharing,
  the email gate, bundle pages and consolidation, resend/extend/revoke and
  their bulk forms).
- **v1.0.0** — everything at and before 2026-07-06.

## v1.2.0 — 2026-07-21

### Added
- **Email watermark on the player.** The verified recipient's email can be
  overlaid across the video (tiled, plus one drifting copy so a fixed crop
  can't remove every instance) to deter casual re-sharing and attribute a
  leaked screen-recording to one person. Layered control: a global default
  (admin Settings panel), a per-share Always/Never override (single + bulk
  Share forms), a per-video Always/Never override (select on each Videos row),
  and an exemption list of emails/domains that are never watermarked (e.g.
  internal admins/reviewers). Resolution order is exemption → per-share →
  per-video → global default. Honest limit: it's a client-side overlay over the cross-origin
  player, not burned into the video pixels — it raises effort and attributes
  leaks, it is not DRM.
- **Per-video analytics.** A collapsible admin panel rolls the existing
  per-share tracking (views, plays, completion, furthest progress) up per
  video — shares, unique recipients, total views, started, completed +
  completion rate, and average progress. Reads only fields already stored; no
  new tracking was added for it.
- **Resume playback.** A returning viewer who left a video partway is offered
  "Resume from m:ss" (or Start over). The player reports a throttled playback
  position while watching; the watch page seeks to it on request. Skipped when
  the saved point is basically the end.
- **Global settings store.** First app-level settings, in a new
  `bunnysettings:global` KV namespace, edited from a Settings panel on the
  admin page and read/written via the admin-only `/api/settings` route.

## 2026-07-21

### Added
- **Bulk revoke.** Select multiple shares in the admin table and revoke them
  all in one action; each link's outcome is reported independently so one
  bad token never blocks the rest. Revoke is now idempotent — revoking an
  already-revoked share succeeds instead of erroring.
- **Extend a share's expiry.** Give a recipient more time without breaking
  their existing link — same token, same URL, same cookie, just a longer
  `expiresAt`. Works even on an already-expired (but not revoked) share,
  extending from now rather than the stale old expiry. Refuses outright to
  extend a revoked share, so it can never double as a silent "un-revoke."
  Bulk form included. If the share belongs to a bundle (see below), the
  bundle's own expiry is extended to match.
- **One bundle per recipient, not one per action.** Repeat shares to the
  same email address — from the single-share or bulk-share flow, in any
  order, at any time — now land in the SAME bundle and consolidate into ONE
  notification email listing everything currently active for that person,
  instead of piling up a new standalone email every time.

## 2026-07-20

### Added
- **Bundle listing page.** A bulk-shared recipient gets one gated page
  (`/bundle/<id>`) listing every video shared with them, alongside — not
  instead of — their individual per-video links. One email verification
  unlocks the whole bundle: it mints a bundle cookie for the listing page
  plus a standard per-video cookie for every member, so clicking through
  plays immediately. Each video still independently enforces its own
  revoke/expiry regardless of the bundle cookie.
- **Email-send failure handling.** A failed notification email no longer
  leaves an invisible "ghost" share — the link still exists, but it's now
  flagged (`emailFailed`, with the error) and shown with a "⚠ email failed"
  badge in the admin table.
- **Resend**, generalized beyond failure recovery: any active share's
  notification can be resent on demand (not only flagged ones), plus a bulk
  "Resend N" action for multiple selected shares.
- Project skill library added under `.claude/skills/` documenting the
  architecture, the email-gate design, the operating runbook, a debugging
  playbook, and the roadmap, for AI-assisted maintenance of this repo.

## 2026-07-19

### Fixed
- Comma-separated recipient emails typed into a single field were stored as
  one combined string instead of fanning out to separate records. This
  silently broke the magic-link gate (a typed address never matched the
  combined string) and caused every recipient in that batch to receive the
  identical link instead of their own. All recipient parsing now goes
  through one `parseEmails()` choke point; already-affected legacy records
  are still matched correctly at the gate as a compatibility repair.

## 2026-07-18

### Added
- **Bulk sharing.** Select multiple videos and share them to multiple
  recipients in one action. Every recipient × video pair gets its own
  independently revocable link — never a link shared between people.
- **Email-gated access.** A recipient must type the email address the link
  was shared with; only on a match does the app email a one-time sign-in
  link. The response is identical whether the email matched, didn't match,
  or the link doesn't exist, so the gate can't be used to probe which
  address a link belongs to.
- **Per-link tracking**: view counts (page opens) and real playback tracking
  (play, 25/50/75/100% progress, via the video player's own events) —
  tracked separately, so "opened the page" and "actually watched it" are
  distinguishable per recipient.
- Resend's HTTP API added as the primary email delivery path, with
  automatic fallback to SMTP if it isn't configured.

## 2026-07-14

### Fixed
- Video thumbnails returning 403 once the CDN pull zone's Token
  Authentication was enabled. Thumbnails need their own signing key,
  distinct from the one used to sign embedded-player URLs — the two had
  been conflated.

## 2026-07-10

### Fixed
- XSS and host-header poisoning in generated share emails (unescaped
  title/link interpolation; the link's origin was trusted from request
  headers without validation).
- Upgraded dependencies to patch known vulnerabilities.

### Removed
- Two CI security-scanner workflows were added and removed again the same
  day — not part of this project's actual CI/deployment setup.

## 2026-07-06

### Added
- Project README.

## 2026-07-03

### Changed
- Reverted the previous day's per-send SMTP `verify()` call, extra env
  validation, and verbose logging — it doubled the round-trip time of every
  send and logged recipient addresses to the console. A one-off,
  on-demand verification check replaced it for diagnostics instead.

### Added
- Link column in the admin shares table.

### Fixed
- The KV key prefix was silently renamed from `share:` to `bunnyshare:` with
  no data migration, orphaning every share created before the change. This
  incident is the origin of the project's standing "never break live links"
  rule for all later work.

## 2026-07-02

### Added
- Initial version: single-recipient share links, video listing from Bunny
  Stream, SMTP email delivery.
