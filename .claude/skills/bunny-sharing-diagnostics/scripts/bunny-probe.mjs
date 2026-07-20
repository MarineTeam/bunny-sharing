#!/usr/bin/env node
// bunny-probe.mjs — verifies Bunny Stream connectivity and URL signing.
// Lists videos via lib/bunny.js, builds an embed URL and (if configured) a
// signed thumbnail URL for the first video, then HEADs the thumbnail and
// interprets the status. Run from repo root (source .env.local first):
//   node .claude/skills/bunny-sharing-diagnostics/scripts/bunny-probe.mjs

const missing = ["BUNNY_LIBRARY_ID", "BUNNY_API_KEY", "BUNNY_TOKEN_KEY"].filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`MISSING ENV: ${missing.join(", ")}. Source your .env.local and retry.`);
  process.exit(2);
}

const bunnyUrl = new URL("../../../../lib/bunny.js", import.meta.url);
const { listVideos, generateEmbedUrl } = await import(bunnyUrl);

try {
  const videos = await listVideos();
  console.log(`PASS — Bunny Stream API reachable; ${videos.length} video(s) in library ${process.env.BUNNY_LIBRARY_ID}.`);
  for (const v of videos.slice(0, 3)) console.log(`  - ${v.title} (${v.id})`);
  if (videos.length === 0) {
    console.log("Library is empty — nothing further to probe.");
    process.exit(0);
  }

  const first = videos[0];
  const embed = generateEmbedUrl(first.id, 3600);
  console.log(`\nEmbed URL (signed 3600s, BUNNY_TOKEN_KEY): ${embed}`);

  if (!first.thumbnail) {
    console.log("No thumbnail URL (BUNNY_PULL_ZONE unset) — skipping thumbnail HEAD check.");
    process.exit(0);
  }
  console.log(`Thumbnail URL: ${first.thumbnail}`);
  const head = await fetch(first.thumbnail, { method: "HEAD" });
  console.log(`Thumbnail HEAD status: ${head.status}`);
  if (head.status === 200) {
    console.log("PASS — thumbnail reachable (pull-zone auth OK or not enabled).");
    process.exit(0);
  } else if (head.status === 403) {
    console.error(
      "FAIL 403 — pull-zone token auth mismatch. If Token Authentication is ON in the pull zone, BUNNY_CDN_TOKEN_KEY is missing/wrong " +
        "(it is a DIFFERENT key from BUNNY_TOKEN_KEY — see bunny-stream-reference). If it is OFF, unset BUNNY_CDN_TOKEN_KEY."
    );
    process.exit(1);
  } else {
    console.error(`UNEXPECTED status ${head.status} — check BUNNY_PULL_ZONE hostname.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`FAIL — ${err.message}`);
  console.error("Interpretation: 'Bunny API error: 401' = wrong BUNNY_API_KEY; 404 = wrong BUNNY_LIBRARY_ID; network errors = connectivity.");
  process.exit(1);
}
