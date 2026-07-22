## v1.3.0

Full lifecycle for the admin's share-management table: undo a revoke, make a
revoke permanent, extend expiry in place, revoke in bulk, and a persistent
link to a recipient's bundle page. All additive — existing share tokens,
`/watch` links, gate cookies, and KV records keep working unchanged.

### Added
- **Restore (un-revoke).** A revoked share can be flipped back to active —
  same token, URL, and cookie as before. Idempotent, kept as its own
  explicit action rather than folded into Extend (which still refuses
  revoked shares outright).
- **Delete permanently.** A revoked share can now be deleted outright — the
  same deletion `/api/cleanup` already does in bulk for revoked/expired
  records, just on demand for one link. Only allowed once a share is
  already revoked, so it's always a deliberate second step after Revoke,
  and it makes Restore impossible afterward — the record is gone, not just
  flagged.
- **Persistent bundle links in the admin table.** Every share belonging to
  a bundle now shows a link to its bundle page directly in the shares
  table, instead of the link only ever appearing once in the toast shown
  right after sharing.
- **Bulk revoke.** Select multiple shares and revoke them all in one
  action; each link's outcome is reported independently so one bad token
  never blocks the rest. Revoke is now idempotent.
- **Extend a share's expiry.** Give a recipient more time without breaking
  their existing link — same token, same URL, same cookie, just a longer
  expiry. Works even on an already-expired (but not revoked) share.
  Refuses outright to extend a revoked share. Bulk form included.
- **One bundle per recipient, not one per action.** Repeat shares to the
  same email address — single or bulk, in any order, at any time — land in
  the SAME bundle and consolidate into ONE notification email listing
  everything currently active for that person, instead of piling up a new
  standalone email every time.

**Full Changelog**: https://github.com/MarineTeam/bunny-sharing/compare/v1.2.0...v1.3.0
