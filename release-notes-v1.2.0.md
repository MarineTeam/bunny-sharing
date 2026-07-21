## v1.2.0

Email watermarking, per-video analytics, and resume playback. All additive —
existing share tokens, `/watch` links, gate cookies, and KV records keep
working unchanged.

### Added
- **Email watermark on the player.** Overlay the viewer's verified email
  across the video (tiled, plus one drifting copy so a fixed crop can't remove
  every instance) to deter casual re-sharing and attribute a leaked
  screen-recording to one person. Control is layered, resolved most-specific
  first: **exemption → per-share → per-video → global default**.
  - *Exemptions* — emails/domains that are never watermarked (e.g. internal
    admins/reviewers), in the admin Settings panel. Always wins.
  - *Per-share* — a Default/Always/Never choice in the single and bulk Share
    forms.
  - *Per-video* — a Default/Always/Never select on each Videos-grid row.
  - *Global default* — a toggle in Settings.

  Honest limit: it's a client-side overlay over the cross-origin player, not
  burned into the video pixels — it raises the effort of a clean leak and
  attributes casual ones, it is not DRM.
- **Per-video analytics.** A collapsible admin panel rolling the existing
  per-share tracking up per video: shares, unique recipients, total views,
  started, completed (with completion rate), and average furthest progress.
  Computed from data already stored — no new tracking was added.
- **Resume playback.** A returning viewer who left a video partway is offered
  "Resume from m:ss" (or Start over). The player reports a throttled position
  while watching; the watch page seeks to it on request. Suppressed near the
  end of the video.
- **Global settings store.** First app-level settings, in a new
  `bunnysettings:global` KV namespace, edited from the admin page and managed
  via the admin-only `/api/settings` and `/api/video-watermark` routes.

**Full Changelog**: https://github.com/MarineTeam/bunny-sharing/compare/v1.1.0...v1.2.0
