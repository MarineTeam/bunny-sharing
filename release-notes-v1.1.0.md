## v1.1.0

Bulk sharing, the email gate, bundle pages, and the resend / extend / revoke
actions (plus their bulk forms). Everything from 2026-07-18 through 2026-07-21.

### Added
- **Bulk sharing.** Select multiple videos and share them to multiple
  recipients in one action. Every recipient × video pair gets its own
  independently revocable link — never a link shared between people.
- **Email-gated access.** A recipient must type the email address the link was
  shared with; only on a match does the app email a one-time sign-in link. The
  response is identical whether the email matched, didn't match, or the link
  doesn't exist, so the gate can't be used to probe which address a link
  belongs to.
- **Bundle listing page** (`/bundle/<id>`). A bulk-shared recipient gets one
  gated page listing every video shared with them, alongside their individual
  per-video links. One email verification unlocks the whole bundle; each video
  still independently enforces its own revoke/expiry.
- **One bundle per recipient.** Repeat shares to the same email — from any flow,
  in any order — land in the SAME bundle and consolidate into ONE notification
  email listing everything currently active for that person.
- **Resend**, generalized: any active share's notification can be resent on
  demand, plus a bulk "Resend N" action.
- **Extend a share's expiry** without breaking the link — same token, URL, and
  cookie, just a longer `expiresAt`. Works on already-expired (but not revoked)
  shares; refuses to extend a revoked share so it can't act as a silent
  un-revoke. Bulk form included; a member's bundle expiry is extended to match.
- **Bulk revoke.** Revoke multiple selected shares in one action; each link's
  outcome is reported independently. Revoke is now idempotent.
- **Per-link tracking**: view counts (page opens) and real playback tracking
  (play, 25/50/75/100% progress) — tracked separately so "opened" and
  "actually watched" are distinguishable per recipient.
- **Email-send failure handling.** A failed notification no longer leaves an
  invisible share — it's flagged (`emailFailed`) and badged in the admin table.
- Resend HTTP API as the primary email delivery path, with automatic fallback
  to SMTP if it isn't configured.
- Project skill library under `.claude/skills/` documenting the architecture,
  email-gate design, operating runbook, debugging playbook, and roadmap.

### Fixed
- Comma-separated recipient emails in a single field were stored as one
  combined string instead of fanning out to separate records, silently breaking
  the magic-link gate. All recipient parsing now goes through one
  `parseEmails()` choke point; legacy records are still matched at the gate.

**Full Changelog**: https://github.com/MarineTeam/bunny-sharing/compare/v1.0.0...v1.1.0
