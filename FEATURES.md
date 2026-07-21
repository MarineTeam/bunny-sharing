# Features

A detailed look at what this app does. For setup, see [README.md](./README.md).
For a dated history of when each of these landed, see [CHANGELOG.md](./CHANGELOG.md).

## Sharing

### Single share
Pick one video, enter a recipient email and an expiry window (default 72
hours), and the app creates a unique link (`/watch/<token>`) and emails it
to them. The link is independently revocable and never shared with anyone
else.

### Bulk share
Select multiple videos and share them to multiple recipients (comma,
semicolon, or whitespace-separated) in one action. Every recipient × video
pair gets its own distinct link — an M-recipient, N-video bulk share creates
M×N independent links, not M×N copies of the same one. Each recipient
receives a single email listing only their own links, never anyone else's.

### One bundle per recipient
Sharing something new to an email address that already has an active share
— whether via a single share or a bulk share, in either order, at any later
time — doesn't create a new, separate notification. It folds into that
recipient's existing **bundle**: the new link is added to their bundle page,
and the notification email is rebuilt to list everything currently active
for them, not just what's new. A recipient's first-ever share still gets a
plain, simple email; every share after that consolidates.

### Bundle listing page
Once a recipient has more than one active share, they also get a bundle
page (`/bundle/<id>`) — one link listing everything shared with them.
Verifying their email once unlocks the *entire* bundle: every video in it
becomes playable immediately, without a second email round-trip per video.
Each video still independently enforces its own revoke/expiry status on
every page load, regardless of the bundle unlock — revoking one video is
reflected instantly on the bundle page too, without touching the bundle
record itself.

## Access control

### Email-gated links
A share link alone isn't enough to watch the video. The recipient must
type the exact email address the link was shared with; only on a match
does the app send a one-time "magic" sign-in link to that address. This
proves the visitor controls the inbox the link was intended for, not just
that they have the URL.

### Anti-enumeration
The response to a gate attempt is byte-for-byte identical whether the
email matched, didn't match, the link is invalid, revoked, expired, or the
request was throttled. This means the gate can't be used to probe which
email address a given link belongs to, or to enumerate valid links.

### Revocation
Any share can be revoked instantly from the admin table. Revocation is a
flag, not a delete — the record and its history stay intact, and a
recipient's cookie (if they had one) is checked against the live record on
every request, so revocation takes effect even mid-session. Revoking is
idempotent: revoking an already-revoked link succeeds without complaint.

### Rate limiting
Requesting a magic link for the same share is throttled to one per 30
seconds, so the gate can't be used to spam a recipient's inbox.

## Watermarking

Optionally overlay the recipient's verified email address across the video
player as a drifting, tiled watermark. Because every viewer has proven
control of a specific inbox to get in, a leaked screen-recording carries the
email of whoever leaked it — a deterrent against casual re-sharing and a way
to attribute leaks.

Control is layered, resolved per view:

- **Global default** — a toggle in the admin **Settings** panel turns
  watermarking on for every player by default.
- **Per-share override** — the Share form offers a Default / Always / Never
  choice, so you can force a watermark on an especially sensitive video (or
  off on a routine one) regardless of the global default.
- **Exemptions** — lists of exempt email addresses and exempt domains (also
  in Settings) that are *never* watermarked, however the above resolve. This
  is how you exempt internal viewers such as admins or reviewers in an app
  that has no user accounts: by the email or domain they verify with.

Resolution order is **exemption → per-share → global default** — an exempt
viewer is never watermarked; otherwise a share's own Always/Never wins;
otherwise the global default applies.

Honest limitation: the watermark is a client-side overlay drawn over the
(cross-origin) player, not burned into the video's pixels — doing that would
require per-view server-side transcoding the video host doesn't expose here.
A determined viewer can remove the overlay with browser dev tools. It raises
the effort of a clean leak and attributes the casual ones; it is not DRM.

## Admin actions

Every share in the admin table supports these actions, individually or in
bulk (select multiple rows via checkboxes, then apply the action to all of
them at once — a bad or already-inapplicable link in the selection never
blocks the rest):

- **Resend** — re-send the share's notification email on demand. Works on
  any active share, not only ones whose original send failed — useful when
  a recipient says they never got the email.
- **Extend** — give a recipient more time without changing their link: the
  same token, same URL, same cookie, just a later expiry. Works even on an
  already-expired (but not revoked) share, extending from now rather than
  the old expiry. Refuses to extend a revoked share, so it can never
  quietly double as an "un-revoke." If the share belongs to a bundle, the
  bundle's own expiry is extended to match.
- **Revoke** — immediately cut off access. Reversible by flag (not a
  delete) and idempotent.

## Delivery failure handling

If a notification email fails to send (bad SMTP creds, a Resend outage,
etc.), the share link is still created and still works — it's just flagged
in the admin table ("⚠ email failed", with the underlying error shown on
hover) instead of silently existing with nobody told about it. Fix the
mailer configuration and hit Resend to deliver it.

## Tracking

### View tracking
Every time a recipient opens an authorized `/watch` page, the share
record's view count and last-viewed timestamp update. Shown in the admin
table as `N×` with a hover tooltip for the exact time.

### Playback tracking
Separately from views, the app listens to the video player's own events
(play, timeupdate, ended) to track *actual playback*: whether the video was
started, how far it got (25/50/75/100% milestones), and when it completed.
This is deliberately independent of view tracking — opening the page
doesn't mean anyone pressed play, and the admin table shows both so you can
tell "opened" from "actually watched."

Shown in the Watched column as `—` (never played) / `started` / `NN%` /
`100% ✓`.

### Per-video analytics
A collapsible **Analytics** panel on the admin page rolls the per-share
tracking above up per video: how many times it was shared, to how many
distinct recipients, total views, how many recipients started it, how many
completed it (with the completion rate), and the average furthest progress.
It's computed entirely from the tracking already stored on each share — no
extra data is collected for it.

## Resume playback

A recipient who watches part of a video and returns later is offered
"Resume from *m:ss*" (or "Start over") instead of restarting from zero. The
player reports a throttled playback position while watching, and the watch
page seeks to it on request. The offer is suppressed when the saved point is
effectively the end of the video, so someone who finished doesn't get asked
to resume at the credits.

## Email delivery

Emails are sent via [Resend](https://resend.com/)'s HTTP API when
`RESEND_API_KEY` is set, or standard SMTP otherwise (any provider — Brevo,
SMTP2GO, a Gmail app password, Resend's own SMTP bridge, etc.). Every email
in the app — share notifications, bundle notifications, magic links — goes
through this same single delivery path, so switching providers is a config
change, not a code change.

## Maintenance

- **Cleanup** — a single admin action (or scheduled job) purges revoked and
  expired share records and their associated bundle records once nothing
  in them is still valid. Active shares are never touched.
- **`.claude/skills/`** — this repo ships a project-specific skill library
  documenting its architecture, security invariants, operating runbook,
  debugging playbook, and roadmap, intended to let an AI coding session (or
  a new maintainer) work on this codebase without prior context.
