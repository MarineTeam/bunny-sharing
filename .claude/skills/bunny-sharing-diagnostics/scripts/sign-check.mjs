#!/usr/bin/env node
// sign-check.mjs — given a signed Bunny URL (embed or CDN), recompute the
// signature with the local env keys and report MATCH/MISMATCH + time to
// expiry. Turns "is my key right?" into a measurement. Run from repo root:
//   node .claude/skills/bunny-sharing-diagnostics/scripts/sign-check.mjs --url "<signed url>"
// Uses BUNNY_TOKEN_KEY for iframe.mediadelivery.net embed URLs and
// BUNNY_CDN_TOKEN_KEY for pull-zone (b-cdn.net etc.) URLs — mirrors lib/bunny.js.

import crypto from "crypto";

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const raw = urlIdx !== -1 ? args[urlIdx + 1] : null;
if (!raw) {
  console.error('Usage: sign-check.mjs --url "<signed bunny url>"');
  process.exit(2);
}

let u;
try {
  u = new URL(raw);
} catch {
  console.error("FAIL: not a parseable URL.");
  process.exit(2);
}

const token = u.searchParams.get("token");
const expires = u.searchParams.get("expires");
if (!token || !expires) {
  console.error("FAIL: URL has no token/expires query params — it is not a signed Bunny URL.");
  process.exit(2);
}

const secondsLeft = Math.floor(Number(expires) - Date.now() / 1000);
console.log(`expires=${expires} (${secondsLeft >= 0 ? `${secondsLeft}s remaining` : `EXPIRED ${-secondsLeft}s ago`})`);

const isEmbed = u.hostname === "iframe.mediadelivery.net";
if (isEmbed) {
  // lib/bunny.js generateEmbedUrl: sha256 hex of TOKEN_KEY + videoId + expires
  const key = process.env.BUNNY_TOKEN_KEY;
  if (!key) {
    console.error("MISSING ENV: BUNNY_TOKEN_KEY (needed to check embed URLs).");
    process.exit(2);
  }
  const parts = u.pathname.split("/").filter(Boolean); // embed/<libraryId>/<videoId>
  const videoId = parts[2];
  const expected = crypto.createHash("sha256").update(key + videoId + expires).digest("hex");
  report(expected, token, "embed (BUNNY_TOKEN_KEY, sha256 hex over key+videoId+expires)");
} else {
  // lib/bunny.js signCdnUrl: sha256 base64url of CDN_KEY + pathname + expires
  const key = process.env.BUNNY_CDN_TOKEN_KEY;
  if (!key) {
    console.error("MISSING ENV: BUNNY_CDN_TOKEN_KEY (needed to check pull-zone/CDN URLs).");
    process.exit(2);
  }
  let expected = crypto.createHash("sha256").update(key + u.pathname + expires).digest("base64");
  expected = expected.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  report(expected, token, "CDN (BUNNY_CDN_TOKEN_KEY, sha256 base64url over key+pathname+expires)");
}

function report(expected, actual, scheme) {
  console.log(`scheme: ${scheme}`);
  if (expected === actual) {
    console.log(`MATCH — the local key signs this URL identically. ${secondsLeft < 0 ? "But it is EXPIRED — that alone causes 403s." : "If it still 403s, the key is right but Bunny-side config (token auth toggle, allowed referrers) differs."}`);
    process.exit(0);
  } else {
    console.log("MISMATCH — the local env key does NOT produce this URL's token. Either the URL was signed with a different key, or your env has the wrong key (remember: embed and CDN keys are different — see bunny-stream-reference).");
    process.exit(1);
  }
}
